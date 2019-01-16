const path = require('path');
const os = require('os');
const express = require('express');
const Gun = require('gun');

const port = 9981;
const hostname = os.hostname();

const app = express();

app.use(Gun.serve);
app.use(express.static(__dirname));
app.use(
    express.json({
        limit: '100mb',
    })
);

const httpServer = app.listen(port);

const gun = Gun({
    peers: [
        'http://10.10.10.18/gun',
        'http://10.10.10.54/gun',
    ],
    file: path.join(__dirname, 'data'),
    web: httpServer,
});

/**
 * @return {Promise<{}[]>}
 */
const getAllMessages = () => {
    return new Promise((resolve) => {
        gun.get('messages').once(data => {
            if (!data) {
                resolve([]);
                return;
            }

            Promise.all(Object.keys(data)
                .filter(key => key !== '_' && data[key])
                .map(key => gun.get(key).once().then())
            )
                .then(resolve);
        });
    });
};

setInterval(() => {
    getAllMessages().then(
        messages => console.log(messages.length, messages.map(x => x.content).join('; '))
    );
}, 1000);

/**
 * @param {function} fn
 * @return {function}
 */
function wrapAsync(fn) {
    return (req, res, next) => {
        // Make sure to `.catch()` any errors and pass them along to the `next()`
        // middleware in the chain, in this case the error handler.
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

app.post('/message', wrapAsync(async (req, res) => {
    const message = {
        ...req.body,
        hostname,
    };
    gun.get('messages').set(message);
    res.json({
        status: 'success',
    });
}));

app.delete('/message', wrapAsync(async (req, res) => {
    const { key } = req.body;
    console.log(`Removing message ${key}`);
    gun.get('messages').get(key).put(null);
    res.json({
        status: 'success',
    });
}));