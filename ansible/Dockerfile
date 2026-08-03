FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends openssh-client sshpass && \
    pip install --no-cache-dir ansible && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /ansible

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]