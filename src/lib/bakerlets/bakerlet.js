const { commands, modules } = require('../../baker');
const ssh = modules['ssh'];
const path = require('path');

class Bakerlet
{
    constructor(ansibleSSHConfig)
    {
        this.ansibleSSHConfig = ansibleSSHConfig;
    }

    setRemotesPath(remotesPath)
    {
        this.remotesPath = remotesPath;
    }

    setBakePath(bakePath)
    {
        this.bakePath = bakePath;
    }

    setVMSSHConfig(vmSSHConfig)
    {
        this.vmSSHConfig = vmSSHConfig;
    }

    setVerbose(verbose)
    {
        this.verbose = verbose;
    }


    async copy(src,dest)
    {
        // Copy common ansible scripts files
        await ssh.copyFromHostToVM(
            src,
            dest,
            this.ansibleSSHConfig,
            false
        );
    }

    async exec(cmd) {
        // Run cmd on remote server
        await ssh.sshExec(cmd, this.ansibleSSHConfig, this.verbose);
    }
}

module.exports = Bakerlet;