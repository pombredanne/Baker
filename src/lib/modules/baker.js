const Promise       = require('bluebird');
const conf          = require('./configstore');
const fs            = require('fs-extra');
const inquirer      = require('inquirer');
const mustache      = require('mustache');
const netaddr       = require('netaddr');
const path          = require('path');
const print         = require('./print');
const Provider      = require('../modules/providers/provider');
const spinner       = require('./Spinner');
const Ssh           = require('./ssh');
const Utils         = require('./utils/utils');
const vagrant       = Promise.promisifyAll(require('node-vagrant'));
const validator     = require('validator');
const yaml          = require('js-yaml');

const VagrantProvider = require('./providers/vagrant');
const VirtualBoxProvider = require('./providers/virtualbox');
const DockerProvider  = require('./providers/docker');
const DO_Provider     = require('./providers/digitalocean');
const RemoteProvider  = require('./providers/remote');

// conf variables:
const spinnerDot = conf.get('spinnerDot');

const { configPath, ansible, boxes, bakeletsPath, remotesPath } = require('../../global-vars');

class Baker {
    /**
     *
     * @param {Provider} provider
     */
    constructor(provider) {
        this.provider = provider;
    }

    async ssh(name) {
        await this.provider.ssh(name);
    }

    async start(name, verbose) {
        await this.provider.start(name, verbose);
    }

    async stop(name, force) {
        await this.provider.stop(name, force);
    }

    async delete(name) {
        await this.provider.delete(name);
    }

    async bake(scriptPath, ansibleSSHConfig, verbose) {
        await this.provider.bake(scriptPath, ansibleSSHConfig, verbose);
    }

    async list() {
        await this.provider.list();
    }

    async images(){
        await this.provider.images();
    }

    static async init() {
        let bakerYML = await fs.readFile(path.join(configPath, './bakerTemplate.yml'), 'utf8');
        let dir = path.resolve(process.cwd());
        await fs.writeFile('baker.yml', bakerYML, {encoding:'utf8'});
    }

    /**
     * detects the type of environment.
     * Helper function for commands to automatically create the right provider object.
     * @param {String} bakePath path to the baker.yml file
     */
    static async chooseProvider(bakePath){
        let doc = yaml.safeLoad(await fs.readFile(path.join(bakePath, 'baker.yml'), 'utf8'));
        let envName = doc.name;
        let envType = doc.container ? 'container' : doc.vm || doc.vagrant ? 'vm' : doc.remote ? 'remote' : 'other';

        let provider = null;
        if(envType === 'container')
            provider = new DockerProvider({host: '192.168.252.251', port: '2375', protocol: 'http'});
        else if(envType === 'vm')
            //provider = new VagrantProvider();
            provider = new VirtualBoxProvider();
        else if(envType === 'remote'){
            if(!RemoteProvider.validateBakerYML(bakePath)){
                console.error('invalid baker.yml for remote provider');
                process.exit(1);
            }
            else
                provider = new RemoteProvider(doc.remote.user, doc.remote.private_key, doc.remote.ip, doc.remote.port);
        }
        else
            console.error('This command only supports VM and container environments');

        let BakerObj = new Baker(provider);

        return {envName, provider, BakerObj};
    }

    static async getCWDBakerYML(){
        let cwd = path.resolve(process.cwd());
        let bakePath = path.resolve(cwd, 'baker.yml')
        if(await fs.pathExists(bakePath)){
            let bakerYML = yaml.safeLoad(await fs.readFile(bakePath, 'utf8'));
            bakerYML.cwd = cwd;
            return bakerYML;
        } else{
            return undefined;
        }
    }

    /**
     * Get ssh configurations
     * @param {Obj} machine
     * @param {Obj} nodeName Optionally give name of machine when multiple machines declared in single Vagrantfile.
     */
    static async getSSHConfig (machine, nodeName) {
        this.provider.getSSHConfig(machine, nodeName);
    }

    static async runAnsibleVault (doc, pass, dest, ansibleSSHConfig) {
        return new Promise( async (resolve, reject) => {
            let key = doc.bake.vault.checkout.key;
            await Ssh.sshExec(`cd /home/vagrant/baker/${doc.name} && echo "${pass}" > vault-pwd`, ansibleSSHConfig);
            await Ssh.sshExec(`cd /home/vagrant/baker/${doc.name} && ansible-playbook -e "vault=${doc.name}/baker-vault.yml key=${key} dest=${dest}" -i baker_inventory --vault-password-file=vault-pwd ../CheckoutFromVault.yml`, ansibleSSHConfig)
            //await sshExec(`cd /home/vagrant/baker/${doc.name} && echo "${pass}" > vault-pwd &&  ansible-vault view baker-vault.yml --vault-password-file=vault-pwd > checkout.key`, sshConfig);
            //await sshExec(`cd /home/vagrant/baker/${doc.name} && ansible all -i baker_inventory --private-key id_rsa -u ${vmSSHConfigUser.user} -m copy -a "src=checkout.key dest=${dest} mode=0600"`, sshConfig)
            await Ssh.sshExec(`cd /home/vagrant/baker/${doc.name} && rm vault-pwd`, ansibleSSHConfig)
            resolve();
        });
    }

    // TODO: Need to be cleaning cmd so they don't do things like
    // ; sudo rm -rf / on our server...
    static async runAnsiblePlaybook (doc, cmd, ansibleSSHConfig, verbose, variables) {
        let flatVars = {};
        for( var i =0; i < variables.length; i++ )
        {
            for( var key in variables[i] )
            {
                flatVars[key] = variables[i][key];
            }
        }
        let extravars = JSON.stringify(flatVars);
        //let extravars = yaml.dump(variables);
        if( verbose ) console.log( extravars );
        // return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && ansible all -m ping -i baker_inventory`, ansibleSSHConfig, verbose);
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && echo '${extravars}' > playbook.args.json && ansible-playbook -e @playbook.args.json -i baker_inventory ${cmd}; rm -f playbook.args.json`, ansibleSSHConfig, verbose);
    }

    static async runGitClone (doc, repo, dest, ansibleSSHConfig,verbose) {
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && ansible all -m git -a "repo=${repo} dest=${dest} version=HEAD" -i baker_inventory`, ansibleSSHConfig, verbose);
    }

    static async runAnsibleAptInstall (doc, cmd, ansibleSSHConfig,verbose) {
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && ansible all -m apt -a "pkg=${cmd} update_cache=yes cache_valid_time=86400" -i baker_inventory --become`, ansibleSSHConfig, verbose);
    }

    static async runAnsiblePipInstall (doc, requirements, ansibleSSHConfig, verbose) {
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && ansible all -m pip -a "requirements=${requirements}" -i baker_inventory --become`, ansibleSSHConfig, verbose);
    }

    static async runAnsibleNpmInstall (doc, packagejson, ansibleSSHConfig, verbose) {
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && ansible all -m npm -a "path=${packagejson}" -i baker_inventory`, ansibleSSHConfig, verbose);
    }

    static async runAnsibleTemplateCmd (doc, src, dest, variables, ansibleSSHConfig, verbose) {
        let flatVars = {};
        for( var i =0; i < variables.length; i++ )
        {
            for( var key in variables[i] )
            {
                flatVars[key] = variables[i][key];
            }
        }
        let extravars = JSON.stringify(flatVars);
        //let extravars = yaml.dump(variables);
        return Ssh.sshExec(`export ANSIBLE_HOST_KEY_CHECKING=false && cd /home/vagrant/baker/${doc.name} && echo '${extravars}' > template.args.json && ansible all -m template -a "src=${src} dest=${dest}" -e @template.args.json -i baker_inventory; rm -f template.args.json`, ansibleSSHConfig, verbose);
    }

    static async info (envName, provider, verbose) {

        if( provider === 'digitalocean')
        {
            //console.log(envName, provider, verbose);
            let token = process.env.DOTOKEN;
            let dir = path.join(require('os').homedir(), '.baker', envName);

            let do_provider = new DO_Provider(token, dir);
            let nodes = await do_provider.info();
            console.log( JSON.stringify(nodes) );
        }
        else
        {
            console.log( JSON.stringify((await VagrantProvider.retrieveSSHConfigByName(envName) )));
        }

        return;
    }

}

module.exports = Baker;
