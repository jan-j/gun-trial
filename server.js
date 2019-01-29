const path = require('path');
const os = require('os');
const express = require('express');
const Gun = require('gun');
const _ = require('lodash');

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
        `http://10.10.10.18:${port}/gun`,
        `http://10.10.10.54:${port}/gun`,
    ],
    file: path.join(__dirname, 'data'),
    web: httpServer,
});

/**
 * @param {string} key
 * @return {Promise<{}[]>}
 */
const getAll = (key) => {
    return new Promise((resolve) => {
        gun.get(key).once(data => {
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

const author = {
    timestamp: Date.now(),
    name: `Author ${Math.floor(Math.random() * 1000)}`,
};
gun.get('authors').set(author);

setInterval(() => {
    getAll('messages').then(
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
    const authors = await getAll('authors');
    const message = {
        ...req.body,
        hostname,
        author: _.sample(authors) || null,
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

app.put('/message', wrapAsync(async (req, res) => {
    const { key } = req.body;
    console.log(`Updating message ${key}`);
    gun.get(key).once(message => {
        gun.get('messages').get(key).put({
            updated: true,
            updates: 123,
        });
    });
    res.json({
        status: 'success',
    });
}));