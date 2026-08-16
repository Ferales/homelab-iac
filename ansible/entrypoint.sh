#!/bin/bash
set -e

mkdir -p ~/.ssh
cp /keys/homelab_key ~/.ssh/homelab_key
chmod 600 ~/.ssh/homelab_key

chmod 755 /ansible
chmod 600 ./ansible.cfg

cp /pass.txt /ansible/vault/pass.txt
chmod 600 /ansible/vault/pass.txt

> ~/.ssh/known_hosts
for ip in 192.168.33.{2..7}; do
  ssh-keyscan $ip >> ~/.ssh/known_hosts
done

exec "$@"