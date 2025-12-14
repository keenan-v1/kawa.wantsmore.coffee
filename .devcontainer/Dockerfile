FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Install doctl (DigitalOcean CLI) - fetches latest release
RUN DOCTL_VERSION=$(curl -s https://api.github.com/repos/digitalocean/doctl/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//') \
    && curl -sL "https://github.com/digitalocean/doctl/releases/download/v${DOCTL_VERSION}/doctl-${DOCTL_VERSION}-linux-amd64.tar.gz" | tar -xzv \
    && mv doctl /usr/local/bin/ \
    && apt-get update \
    && apt-get install -y postgresql-client

# Enable corepack and prepare pnpm (requires root)
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
