const API_URL = `https://ourbox.herokuapp.com/api`;
// const API_URL = `http://localhost:5000/api`;

async function showFileList() {
    try {
        let result = await fetch(API_URL);
        result = await result.json();
        for await (const file of result) {
            const fileTable = document.getElementById('file-table');
            const row = document.createElement('tr');
            const nameCol = document.createElement('td');
            const downloadAnchor = document.createElement('a');
            downloadAnchor.download = file.name;
            downloadAnchor.href = await getDownloadUrl(file.fullPath);
            downloadAnchor.innerHTML = file.name;
            nameCol.appendChild(downloadAnchor);
            const sizeCol = document.createElement('td');
            sizeCol.innerHTML = (parseFloat(file.size) / (1024 * 1024)).toFixed(2);
            const updatedCol = document.createElement('td');
            updatedCol.innerHTML = new Date(file.updated).toLocaleString();
            const delButtonCol = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = 'Delete';
            deleteButton.onclick = () => { deleteItem(file.fullPath) };
            delButtonCol.appendChild(deleteButton);
            row.appendChild(nameCol);
            row.appendChild(sizeCol);
            row.appendChild(updatedCol);
            row.appendChild(delButtonCol);
            fileTable.appendChild(row);
        }
    } catch (err) {
        console.log(err);
        alert('File listing failed');
    }
}

function validateSize(data) {
    if (data.files.length > 4) {
        alert('You can only upload 4 files at a time');
    }
    else {
        for (const file of data.files) {
            const fileSize = file.size / (1024 * 1024);
            if (fileSize > 8) {
                alert(`${file.name} is ${fileSize.toFixed(2)} MB. File should be less than 8 MB`);
            }
        }
    }
}

async function deleteItem(path) {
    try {
        const result = await fetch(API_URL, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path
            })
        });
        if (result.status === 200)
            alert('Deleted Successfully. Refresh to update the UI.');
        else
            alert('Delete failed');
    } catch (err) {
        console.log(err);
        alert('Delete failed');
    }
}

async function getDownloadUrl(path) {
    try {
        let result = await fetch(`${API_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path
            })
        });
        result = await result.text();
        return result;
    } catch (err) {
        console.log(err);
        return '';
    }
}

async function upload(event) {
    try {
        const uploader = document.getElementById('file-uploader');
        let result = await fetch(API_URL, {
            method: 'POST',
            body: new FormData(uploader)
        });
        result = await result.json();
        console.log(result);
        alert('Refresh to view the updates');
    } catch (err) {
        console.log(err);
    }
}