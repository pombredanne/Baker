const Baker          = require('../modules/baker');
const conf           = require('../../lib/modules/configstore')
const Print          = require('../modules/print');
const Spinner        = require('../modules/spinner');
const spinnerDot     = conf.get('spinnerDot');

exports.command = 'status';
exports.desc = `Show status for all Baker VMs`;
exports.handler = async function(argv) {

    try {
//        await Spinner.spinPromise(Baker.list(), `Getting status of Baker environments`, spinnerDot);
        await Baker.list();
    } catch (err) {
        Print.error(err);
    }
}