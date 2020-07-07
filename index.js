const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const firebase = require('firebase/app');
global.XMLHttpRequest = require('xhr2');
require('firebase/auth');
require('firebase/storage');
require('dotenv').config();

const PORT = process.env.PORT;
const app = new express();
const upload = multer();
const uploadTasks = new Map();

app.use(cors());
app.use(helmet());
app.use(compression());
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

// Get List of files in the root
app.get('/api/', async (req, res) => {
    try {
        res.send(await listFilesInRoot());
    } catch (err) {
        res.status(404).send(err);
    }
});

// Upload files to root
app.post('/api/', upload.fields([{ name: 'files-to-upload', maxCount: 4 }]), async (req, res) => {
    try {
        const errors = [];
        for (const file of req.files['files-to-upload']) {
            try {
                const fileSize = file.size / (1024 * 1024);
                if (fileSize > 8) {
                    errors.push({ name: file.originalname, error: 'File should be less than 8 MB' });
                }
                else {
                    uploadItem(file.originalname, file.buffer);
                }
            } catch (err) {
                errors.push({ name: file.originalname, error: err });
            }
        }
        res.send({
            errors
        });
    } catch (err) {
        console.log(err);
        res.status(404).send(err);
    }
});

// Get download URL for the requested file
app.post('/api/download', async (req, res) => {
    try {
        res.send(await downloadItem(req.body.path));
    } catch (err) {
        res.status(404).send(err.message);
    }
});

// Delete the requested file
app.delete('/api/', async (req, res) => {
    try {
        res.send(await deleteItem(req.body.path));
    } catch (err) {
        res.status(404).send(err.message);
    }
});

// Perform pause, resume, cancel operations on upload tasks
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

// Get list of upload tasks
app.get('/api/uploads', async (req, res) => {
    try {
        const data = [];
        printUploadTasksMap('/api/uploads');
        for (const task of uploadTasks) {
            const { bytesTransferred, totalBytes, state } = task[1].snapshot;
            data.push({
                file: task[0],
                bytesTransferred: `${(bytesTransferred / (1024 * 1024)).toFixed(2)} MB`,
                totalBytes: `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`,
                progress: ((bytesTransferred / totalBytes) * 100).toFixed(2),
                state
            });
        }
        res.send(data);
    } catch (err) {
        console.log(err);
        res.status(404).send(err);
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
    printUploadTasksMap('uploadItem1');
    if (!uploadTasks.has(fileName)) {
        console.log('Task has been added to uploadTasks Map');
        uploadTasks.set(fileName, uploadTask);
        printUploadTasksMap('uploadItem2');
    }
    else {
        console.log('Already present in uploadTasks Map');
        printUploadTasksMap('uploadItem3');
    }
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
        printUploadTasksMap('uploadItem4');
    }, () => {
        printUploadTasksMap('uploadItem5');
        uploadTasks.delete(fileName);
    });
}

function printUploadTasksMap(name = '') {
    console.log(`start - printUploadTasksMap - ${name}`);
    for (const task of uploadTasks) {
        console.log(task[0], task[1]);
    }
    console.log(`end - printUploadTasksMap - ${name}`);
}