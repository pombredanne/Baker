const Baker          = require('../modules/baker');
const conf           = require('../../lib/modules/configstore');
const Print          = require('../modules/print');
const Spinner        = require('../modules/spinner');
const spinnerDot     = conf.get('spinnerDot');
const Utils          = require('../modules/utils/utils');
const VagrantProvider = require('../modules/providers/vagrant');

exports.command = ['delete [VMName]', 'destroy [VMName]'];
exports.desc = `remove a VM and it's associated files`;
exports.builder = (yargs) => {
    yargs
        .example(`$0 destroy`, `Destroys the VM build from baker.yml of current directory`)
        .example(`$0 destroy baker-test`, `Destroys baker-test VM`);

    // TODO: bakePath is required for finding the envType.
    // for now assuming the command is executed in same dir as baker.yml
    // yargs.positional('envName', {
    //         describe: 'Name of the environment to be destroyed',
    //         type: 'string'
    //     });
}

exports.handler = async function(argv) {
    let { envName } = argv;

    try {
        // if(!VMName){
        //     let cwdVM = (await Baker.getCWDBakerYML());
        //     if(cwdVM)
        //         VMName = (await Baker.getCWDBakerYML()).name;
        //     else {
        //         Print.error(`Couldn't find baker.yml in cwd. Run the command in a directory with baker.yml or specify a VMName.`);
        //         process.exit(1);
        //     }
        // }

        let bakePath = process.cwd();
        const {envName, BakerObj} = await Utils.chooseProvider(bakePath);

        await Spinner.spinPromise(BakerObj.delete(envName), `Destroying VM: ${envName}`, spinnerDot);
    } catch (err) {
        Print.error(err);
    }
}
