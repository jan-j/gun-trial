const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const express = require('express');
const Gun = require('gun');
const { discoverServers } = require('@eventstag/photo-booth-client');
const hasha = require('hasha');

const _ = require('lodash');

const port = 9981;
const hostname = os.hostname();
const uniqueId = hasha(`${Math.random()}-${hostname}`, { algorithm: 'md5' });

let app;
let httpServer;
let gun;
const peerServers = [];

/**
 * @param {{
 *     storageDir: string,
 * }} opts
 */
const startServer = async (opts = {}) => {
    app = express();

    app.use(Gun.serve);
    // app.use(express.static(__dirname));
    app.use(
        express.json({
            limit: '100mb',
        })
    );

    app.get('/status', (req, res) =>
        res.json({
            status: 'success',
            data: {
                osHostname: hostname,
                requestHostname: req.hostname,
                uniqueId,
            },
        })
    );

    httpServer = app.listen(port);

    await fse.ensureDir(opts.storageDir);

    gun = Gun({
        peers: [],
        file: path.join(__dirname, 'gun-data'),
        web: httpServer,
    });

    await peersDiscovery();
};

const addPeers = (newPeerServers = []) => {
    if (newPeerServers.length === 0) {
        return;
    }

    const newPeerUrls = newPeerServers.map(server => `${server.url}/gun`);

    peerServers.push(...newPeerServers);
    gun.opt({ peers: newPeerUrls });

    console.log(`New peers added: ${newPeerUrls.join(', ')}`);
};

let peerDiscoveryTimeoutHandle = null;
const peerDiscoveryInterval = 5000;
let previousPeerDiscoveryTime = 0;
const peersDiscovery = async () => {
    previousPeerDiscoveryTime = Date.now();

    const discoveredPeerServers = await discoverServers(null, port, 2000);

    const newPeerServers = [];
    discoveredPeerServers.forEach(peerServer => {
        // skip this server
        if (peerServer.data.uniqueId === uniqueId) {
            return;
        }

        // skip already discovered servers
        if (
            peerServers
                .map(ps => ps.data.uniqueId)
                .indexOf(peerServer.data.uniqueId) !== -1
        ) {
            return;
        }

        // skip just discovered servers
        // (for example server is reachable on 2 different IPs)
        if (
            newPeerServers
                .map(ps => ps.data.uniqueId)
                .indexOf(peerServer.data.uniqueId) !== -1
        ) {
            return;
        }

        newPeerServers.push(peerServer);
    });

    addPeers(newPeerServers);

    peerDiscoveryTimeoutHandle = setTimeout(
        peersDiscovery,
        Math.max(
            0,
            previousPeerDiscoveryTime + peerDiscoveryInterval - Date.now()
        )
    );
};

//
//
// /**
//  * @param {string} key
//  * @return {Promise<{}[]>}
//  */
// const getAll = (key) => {
//     return new Promise((resolve) => {
//         gun.get(key).once(data => {
//             if (!data) {
//                 resolve([]);
//                 return;
//             }
//
//             Promise.all(Object.keys(data)
//                 .filter(key => key !== '_' && data[key])
//                 .map(key => gun.get(key).once().then())
//             )
//                 .then(resolve);
//         });
//     });
// };

// const author = {
//     timestamp: Date.now(),
//     name: `Author ${Math.floor(Math.random() * 1000)}`,
// };
// gun.get('authors').set(author);
//
// setInterval(() => {
//     getAll('messages').then(
//         messages => console.log(messages.length, messages.map(x => x.content).join('; '))
//     );
// }, 1000);
//
// /**
//  * @param {function} fn
//  * @return {function}
//  */
// function wrapAsync(fn) {
//     return (req, res, next) => {
//         // Make sure to `.catch()` any errors and pass them along to the `next()`
//         // middleware in the chain, in this case the error handler.
//         Promise.resolve(fn(req, res, next)).catch(next);
//     };
// }
//
// app.post('/message', wrapAsync(async (req, res) => {
//     const authors = await getAll('authors');
//     const message = {
//         ...req.body,
//         hostname,
//         author: _.sample(authors) || null,
//     };
//     gun.get('messages').set(message);
//     res.json({
//         status: 'success',
//     });
// }));
//
// app.delete('/message', wrapAsync(async (req, res) => {
//     const { key } = req.body;
//     console.log(`Removing message ${key}`);
//     gun.get('messages').get(key).put(null);
//     res.json({
//         status: 'success',
//     });
// }));
//
// app.put('/message', wrapAsync(async (req, res) => {
//     const { key } = req.body;
//     console.log(`Updating message ${key}`);
//     gun.get(key).once(message => {
//         gun.get('messages').get(key).put({
//             updated: true,
//             updates: 123,
//         });
//     });
//     res.json({
//         status: 'success',
//     });
// }));

startServer({ storageDir: __dirname });

module.exports = {
    startServer,
};
