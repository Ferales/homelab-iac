# Homelab — Infrastructure as Code
An educational project built while learning toward a Linux sysadmin role, with a longer-term direction toward DevOps. It demonstrates reproducible infrastructure as code (IaC) — brought up from scratch with a single command, with no manual configuration steps. Built as a portfolio piece and a way to practice tools from both areas: Vagrant, networking, Ansible, Docker, monitoring, backups, CI/CD.

This is intentionally **not** a lab meant to run 24/7 — it's a disposable environment: the value is in being able to reproduce the entire stack from code, on demand, rather than in keeping something permanently online.

## Project goal

Simulate a small but complete infrastructure lifecycle for a sample web application — a reverse proxy, two application instances, a database, and a monitoring stack — all defined as code and reproducible in a few minutes via `vagrant up`.

## Network topology

Private network (host-only): `192.168.33.0/28`

| Machine      | IP             | Role                          | RAM     | vCPU |
|--------------|----------------|--------------------------------|---------|------|
| `lb`         | 192.168.33.2   | Reverse proxy / entry point    | 2048 MB | 1    |
| `app1`       | 192.168.33.3   | Application instance #1        | 4096 MB | 2    |
| `app2`       | 192.168.33.4   | Application instance #2        | 4096 MB | 2    |
| `db`         | 192.168.33.5   | Database                       | 4096 MB | 2    |
| `monitoring` | 192.168.33.6   | Prometheus + Grafana            | 2048 MB | 1    |

Each machine also has a default NAT adapter (internet access, e.g. for `apt`), not directly reachable from the host.

Access from the host:
- SSH to any machine directly via its private network address, using the administrator's key (see below)
- HTTP to `lb`: `http://127.0.0.1:8080` → forwarded to port 80 on `lb`
- `app1`/`app2`/`db`/`monitoring` are not directly exposed to the host outside the private network — application traffic is intended to reach them only through `lb`

All five machines run the same base box (`ubuntu/jammy64`) — a machine's role comes entirely from what gets installed/configured on it via Ansible, not from a different base image ("golden image" approach).

## Prerequisites

- [Vagrant](https://developer.hashicorp.com/vagrant)
- [VirtualBox](https://www.virtualbox.org/)
- Your own SSH key pair (not included in this repo) — generate one locally and place the **public** key at `vagrant/shared/key.pub`
- [Docker](https://www.docker.com/) (for the Ansible controller container)

## Repository structure

```
vagrant/
├── Vagrantfile
├── provision/
│   └── setup-ssh-key.sh   # idempotent provisioning script for the administrator's SSH key
└── shared/
    └── key.pub            # public key (required before `vagrant up`, not committed by default)

ansible/
├── Dockerfile
├── docker-compose.yml
├── entrypoint.sh           # copies the private key + generates known_hosts on container start
├── ansible.cfg
├── inventory/
│   ├── hosts.yml
│   └── group_vars/
│       └── all.yml         # shared connection variables (user, private key path)
└── playbooks/
    ├── base_setup.yml      # baseline configuration common to all machines
    └── firewall_setup.yml  # per-host-group UFW rules + default policies
```

> **Note on SSH key setup:** administrator key distribution happens in `vagrant/provision/setup-ssh-key.sh`, run as part of `vagrant up` — **not** as an Ansible playbook. This is deliberate: Ansible needs working SSH access to connect in the first place, so the key has to be in place *before* the Ansible controller can reach the machines at all.

## Bringing the environment up from scratch

```bash
cd vagrant
vagrant up
```

This provisions all five machines, sets up the private network, and installs the administrator's public key into `authorized_keys` on each of them.

Logging into any machine:
```bash
ssh -i <path_to_your_private_key> vagrant@192.168.33.X
```

Tearing everything down:
```bash
vagrant destroy
```

## Running the Ansible controller

The Ansible controller runs inside a Docker container rather than on the host directly, to keep the environment self-contained and independent of what's installed locally.

```bash
cd ../ansible
$env:SSH_KEY_PATH = "<path_to_your_private_key>"   # PowerShell; use export on Linux/macOS
docker compose run --rm ansible
```

This drops you into an interactive shell inside the controller, with the project files mounted at `/ansible` and the private key copied and secured at `~/.ssh/homelab_key` inside the container. On start, the container also populates `~/.ssh/known_hosts` for all five VM addresses via `ssh-keyscan`.

> **Important:** make sure all five VMs are fully booted (`vagrant up` finished, SSH responsive) *before* starting the Ansible controller container. `entrypoint.sh` currently has no retry/wait logic around `ssh-keyscan` — see [Known limitations](#known-limitations--technical-debt) below.

Test connectivity:
```bash
ansible all -m ansible.builtin.ping
```

> **Note:** if the controller container cannot reach the VMs over SSH (`Connection timed out`), check Windows Firewall — see [Troubleshooting notes](#ansible-controller-docker-could-not-reach-the-vms-over-ssh--windows-firewall) below.

## Playbooks

### `base_setup.yml`
Baseline configuration applied to all five machines: updates the `apt` cache, installs a small set of common tools (`git`, `curl`, `nano`, `htop`), and sets the system timezone to UTC.

### `firewall_setup.yml`
Configures UFW on every machine, with rules scoped per host group (`apps`, `db`, `monitoring`) rather than a single `hosts: all` play with `when` conditions. This keeps each group's rules self-contained and readable, and maps cleanly onto future Ansible roles (each group's play is already structured as a natural candidate for extraction into its own role).

The playbook enforces least-privilege access between machines even though they all sit on the same subnet — e.g. `db:5432` only accepts traffic from the two known application server IPs, not from `lb` or `monitoring`, even though network segmentation alone wouldn't prevent that (segmentation only isolates the private network from the outside; it doesn't restrict traffic *within* it).

SSH access is allowed from two distinct sources, corresponding to the two ways a connection can reach a VM: `10.0.2.2` (the host, when connecting directly via `vagrant ssh`/`vagrant provision` over the NAT adapter) and `192.168.33.1` (the host, when connecting via the Ansible controller container over the private network). These were identified empirically via `auth.log` while debugging SSH connectivity.

Play order is deliberate and important: allow rules (SSH, per-group roles) are applied first, then default deny/allow policy, then `ufw enable` last. Reversing this order risks locking out SSH access mid-run.

## Known limitations / technical debt

Documented here deliberately, rather than silently fixed or hidden — these are conscious trade-offs or known rough edges at the current stage of the project, not oversights.

- **`entrypoint.sh` has no retry/wait logic.** The `ssh-keyscan` loop runs under `set -e`; if a VM isn't fully booted and responsive on port 22 yet, the scan can fail and kill the container's entrypoint before it reaches the Ansible shell. Currently relies on always starting the controller *after* all VMs are confirmed up. A more robust version would retry with a timeout instead of failing immediately.
- **`Vagrantfile` defines each machine as a separate, hand-written block** rather than looping over a data structure (e.g. an array of host definitions). At 5 machines this is easy to maintain; adding more machines means copying a block rather than adding one entry to a list. Left as-is deliberately at this scale — a reasonable refactor target if the machine count grows.

## Troubleshooting notes

Issues encountered while building this project, kept here for reference — both for future-me and as a demonstration of the debugging process.

### Intermittent VM boot timeouts (`rcu_sched` stalls)

Symptom: `vagrant up`/`vagrant provision` would occasionally time out on a seemingly random machine, even when run sequentially (`--no-parallel`). Console access (VirtualBox GUI) showed the guest kernel logging `rcu_sched detected stalls on CPUs/tasks` after a multi-minute gap in the boot log timestamps — indicating the VM's virtual CPU wasn't being scheduled time by the host, not a guest-side failure.

Ruled out: parallel resource contention (occurred even one VM at a time), `vagrant-vbguest` plugin (not installed), disk type (host disk is SSD).

Mitigations applied: added the VirtualBox VMs folder to Windows Defender exclusions; increased `config.vm.boot_timeout`. The issue is intermittent and not fully resolved — if it recurs, check Windows power plan settings (minimum CPU state) and whether other virtualization backends (e.g. Docker Desktop/WSL2) are running concurrently, since VirtualBox and Hyper-V-based virtualization can contend for the same host resources.

### Ansible controller (Docker) could not reach the VMs over SSH — Windows Firewall

Symptom: `ansible all -m ping` from the Ansible controller container failed with `Connection timed out` on port 22 for every host, even though the containerized Ansible controller could ping the private network's gateway (`192.168.33.1`) and the VMs themselves without issue.

Root cause: the container (running under Docker Desktop/WSL2) and the Vagrant VMs (running under VirtualBox host-only networking) sit on two independent virtual network segments on the same physical host. Traffic between them has to pass through the Windows network stack, where Windows Firewall was blocking inbound TCP traffic on port 22 from the `192.168.33.0/28` range — while still allowing ICMP (ping), which is why the network layer looked healthy but SSH did not connect.

Fix: added an inbound Windows Firewall rule (TCP, port 22, remote scope restricted to `192.168.33.0/28`, action: allow) rather than disabling the firewall. This was diagnosed step by step by isolating each layer of the connection: routing (`ping` to gateway and hosts) → firewall (temporarily disabled to confirm, then replaced with a scoped rule) → SSH host key verification (`Host key verification failed`, resolved via `ssh-keyscan` populating `known_hosts` in the entrypoint script) → key-based authentication (final success).

Takeaway: when debugging SSH connectivity across virtualized network boundaries, distinguish failure modes by error message — `Connection timed out` points to routing/firewall, `Host key verification failed` points to `known_hosts`, `Permission denied (publickey)` points to authentication — and test each layer independently (ping → port reachability → SSH handshake) instead of changing configuration at random.

> **Note:** this is the only piece of the entire infrastructure that is *not* version-controlled — the Windows Firewall rule has to be recreated manually on any new host machine cloning this repo.

## Project status

- [x] Networking + multi-machine topology (Vagrant)
- [x] Ansible controller + verified connectivity (Docker, inventory, SSH)
- [x] Baseline configuration automation (`base_setup.yml`)
- [x] Firewall segmentation (`firewall_setup.yml`, UFW per host group)
- [ ] Containerized application (Docker + Node/Express + Postgres)
- [ ] Reverse proxy + TLS
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Backups and restore testing
- [ ] CI/CD