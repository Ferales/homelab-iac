# Homelab — Infrastructure as Code

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

## Prerequisites

- [Vagrant](https://developer.hashicorp.com/vagrant)
- [VirtualBox](https://www.virtualbox.org/)
- Your own SSH key pair (not included in this repo) — generate one locally and place the **public** key at `vagrant/shared/key.pub`

## Repository structure

```
vagrant/
├── Vagrantfile
├── provision/
│   └── setup-ssh-key.sh   # idempotent provisioning script for the administrator's SSH key
└── shared/
    └── key.pub            # public key (required before `vagrant up`, not committed by default)
```

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

## Project status

- [x] Networking + multi-machine topology (Vagrant)
- [ ] Configuration automation (Ansible)
- [ ] Containerized application (Docker)
- [ ] Reverse proxy + TLS
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Backups and restore testing
- [ ] CI/CD