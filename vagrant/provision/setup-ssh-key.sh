#!/bin/bash

PUB_KEY=$(cat /vagrant_shared/key.pub)
KEYS_PATH="/home/vagrant/.ssh/authorized_keys"

mkdir -p /home/vagrant/.ssh
chmod 700 /home/vagrant/.ssh

touch "$KEYS_PATH"
chmod 600 "$KEYS_PATH"

if ! grep -q -F "$PUB_KEY" "$KEYS_PATH"
then
    echo "$PUB_KEY" >> "$KEYS_PATH"
fi