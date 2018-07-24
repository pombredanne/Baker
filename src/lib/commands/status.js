const Baker          = require('../modules/baker');
const conf           = require('../../lib/modules/configstore')
const Print          = require('../modules/print');
const Spinner        = require('../modules/spinner');
const spinnerDot     = conf.get('spinnerDot');
const VirtualboxProvider = require('../modules/providers/virtualbox');

exports.command = 'status';
exports.desc = `Show status for all Baker VMs`;
exports.handler = async function(argv) {

    //TODO: if vagrant:
    // const provider = new VagrantProvider();
    const provider = new VirtualboxProvider();
    const BakerObj = new Baker(provider);

    try {
        await Spinner.spinPromise(BakerObj.list(), `Getting status of Baker VMs`, spinnerDot);
        // let status = (await Utils.getEnvIndex()).map(e => _.pick(e, 'name', 'path', 'type'))
        // console.table(status);
    } catch (err) {
        Print.error(err);
    }
}
