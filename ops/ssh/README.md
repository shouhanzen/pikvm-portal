# PiKVM SSH Setup

This directory contains project-local SSH scaffolding for deploying KVM Portal static assets to the PiKVM.

## Option 1: Include the Project Config

Add this to `~/.ssh/config`:

```sshconfig
Include /path/to/pikvm-portal/ops/ssh/pikvm.config.example
```

Then edit `ops/ssh/pikvm.config.example` or copy it to a private file and include that instead.

## Option 2: Copy Into `~/.ssh/config`

Copy the `Host kvm-portal-pikvm` block from `pikvm.config.example` into `~/.ssh/config`, then update:

- `HostName`
- `User`
- `IdentityFile`
- Any host key policy you prefer

## Smoke Test

After configuring the key, test:

```bash
ssh kvm-portal-pikvm
```

Deploy scripts default to the host from `PIKVM_URL`. Set `KVM_PORTAL_SSH_HOST=kvm-portal-pikvm` if you prefer to deploy through this SSH alias.
