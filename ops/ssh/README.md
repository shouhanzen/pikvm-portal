# PiKVM SSH Setup

This directory contains project-local SSH scaffolding for deploying KVM Portal static assets to the PiKVM.

## Option 1: Include the Project Config

Add this to `~/.ssh/config`:

```sshconfig
Include /home/hanzen/workspace/pikvm-portal/ops/ssh/pikvm.config.example
```

Then edit `ops/ssh/pikvm.config.example` or copy it to a private file and include that instead.

## Option 2: Copy Into `~/.ssh/config`

Copy the `Host kvm-portal-pikvm` block from `pikvm.config.example` into `~/.ssh/config`, then update:

- `User`
- `IdentityFile`
- Any host key policy you prefer

## Smoke Test

After configuring the key, test:

```bash
ssh kvm-portal-pikvm
```

Future deploy scripts should target the `kvm-portal-pikvm` host alias rather than hardcoding the PiKVM address.
