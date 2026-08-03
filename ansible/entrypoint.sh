#!/bin/bash
set -e

mkdir -p ~/.ssh
cp /keys/homelab_key ~/.ssh/homelab_key
chmod 600 ~/.ssh/homelab_key

chmod 755 /ansible
chmod 600 ./ansible.cfg

> /root/.ssh/known_hosts
for ip in 192.168.33.{2..6}; do
  ssh-keyscan $ip >> /root/.ssh/known_hosts
done

exec "$@"