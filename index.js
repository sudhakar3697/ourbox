const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const firebase = require('firebase/app');
global.XMLHttpRequest = require('xhr2');
require('firebase/auth');
require('firebase/storage');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const app = new express();
const upload = multer();
const uploadTasks = new Map();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const firebaseConfig = {
    apiKey: process.env.API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    databaseURL: process.env.DATABASE_URL,
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.APP_ID
};
firebase.initializeApp(firebaseConfig);

const storage = firebase.storage();
const storageRef = storage.ref();

app.get('/api/', async (req, res) => {
    try {
        res.send(await listFilesInRoot());
    } catch (err) {
        res.status(404).send(err.message);
    }
});

app.post('/api/', upload.fields([{ name: 'files-to-upload', maxCount: 4 }]), async (req, res) => {
    try {
        // const downloadURLs = [];
        const errors = [];
        for await (const file of req.files['files-to-upload']) { // await removed
            try {
                const fileSize = file.size / (1024 * 1024);
                if (fileSize > 8) {
                    errors.push({ name: file.originalname, error: 'File should be less than 8 MB' });
                }
                else {
                    // const url = await uploadItem(file.originalname, file.buffer);
                    uploadItem(file.originalname, file.buffer);
                    // downloadURLs.push({ name: file.originalname, downloadUrl: url });
                }
            } catch (err) {
                errors.push({ name: file.originalname, error: err });
            }
        }
        // res.send('Upload started');
        res.send({
            // downloadURLs,
            errors
        });
    } catch (err) {
        console.log(err);
        res.status(404).send(err.message);
    }
});

app.post('/api/download', async (req, res) => {
    try {
        res.send(await downloadItem(req.body.path));
    } catch (err) {
        res.status(404).send(err.message);
    }
});

app.delete('/api/', async (req, res) => {
    try {
        res.send(await deleteItem(req.body.path));
    } catch (err) {
        res.status(404).send(err.message);
    }
});

app.post('/api/uploads', async (req, res) => {
    try {
        switch (req.body.operation) {
            case 'cancel':
                uploadTasks.get(req.body.file).cancel();
                uploadTasks.delete(req.body.file);
                res.send('Cancelled');
                break;
            case 'pause-or-resume':
                const snapshot = uploadTasks.get(req.body.file).snapshot;
                if (snapshot.state === firebase.storage.TaskState.PAUSED) {
                    uploadTasks.get(req.body.file).resume();
                    res.send('Resumed');
                }
                else if (snapshot.state === firebase.storage.TaskState.RUNNING) {
                    uploadTasks.get(req.body.file).pause();
                    res.send('Paused');
                }
                else {
                    res.send('Invalid upload task state found');
                }
                break;
            default:
                res.send('Invalid operation');
                break;
        }
    } catch (err) {
        res.status(404).send(err.message);
    }
});

app.get('/api/uploads', async (req, res) => {
    try {
        const data = [];
        for (const task of uploadTasks) {
            data.push({
                file: task[0],
                bytesTransferred: `${(task[1].snapshot.bytesTransferred / (1024 * 1024)).toFixed(2)} MB`,
                totalBytes: `${(task[1].snapshot.totalBytes / (1024 * 1024)).toFixed(2)} MB`,
                progress: ((task[1].snapshot.bytesTransferred / task[1].snapshot.totalBytes) * 100).toFixed(2),
                state: task[1].snapshot.state
            });
        }
        res.send(data);
    } catch (err) {
        console.log(err);
        res.status(404).send(err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Ourbox is running at ${PORT}`);
})

async function listFilesInRoot() {
    try {
        const data = [];
        const result = await storageRef.listAll();
        // get folders result.prefixes
        for await (const entry of result.items) {
            const { name, fullPath, size, contentType, updated } = await entry.getMetadata();
            data.push({ name, fullPath, size: (size / (1024 * 1024)).toFixed(2), contentType, updated });
        }
        return data;
    } catch (err) {
        throw err;
    }
}

async function downloadItem(path) {
    try {
        return await storageRef.child(path).getDownloadURL();
    } catch (err) {
        throw err;
    }
}

async function deleteItem(path) {
    try {
        return await storageRef.child(path).delete();
    } catch (err) {
        throw err;
    }
}

async function uploadItem(fileName, file) {
    const uploadTask = storageRef.child(fileName).put(file);
    if (!uploadTasks.has(fileName)) {
        console.log('Task has been added to Map');
        uploadTasks.set(fileName, uploadTask);
    }
    return new Promise((resolve, reject) => {
        uploadTask.on(firebase.storage.TaskEvent.STATE_CHANGED, (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
            switch (snapshot.state) {
                case firebase.storage.TaskState.PAUSED:
                    console.log('Upload is paused');
                    break;
                case firebase.storage.TaskState.RUNNING:
                    console.log('Upload is running');
                    break;
            }
        }, (error) => {
            console.log(error.code);
            reject(error.code);
        }, async () => {
            uploadTasks.delete(fileName);
            // const url = await uploadTask.snapshot.ref.getDownloadURL();
            // console.log('File available at', url);
            resolve();
        });
    });
}
