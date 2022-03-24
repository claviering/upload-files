import "./style.css";

interface IUploadCtrl {
  /** true: starting upload. false: stop uploading */
  [key: string]: boolean;
}
let uploadCtrl: IUploadCtrl = {};

interface ICache {
  file: File;
  div: HTMLDivElement;
  currentChunk: number;
}
interface ICacheUploadFile {
  [key: string]: ICache;
}
let cacheUploadFile: ICacheUploadFile = {};

const input = document.querySelector<HTMLInputElement>("#file")!;
input.addEventListener("change", (e: Event) => {
  const files = e && e.target && (<HTMLInputElement>e.target).files;
  if (files && files.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadFile(file);
    }
  }
});
const uploadFile = async (file: File) => {
  let div = document.createElement("div");
  div.className = "upload-result-item";
  div.innerHTML = `<p>${file.name}</p><p>上传前数据处理中...</p>`;
  appendNode(div);
  let md5 = await calcFileHash(file);
  let uploaded = await checkUploaded(md5);
  if (uploaded === 1) {
    div.innerHTML = `<p>${file.name}</p>
    <label ><progress  max="100" value="100"> </progress></label>
    <p>上传完成 (重复上传)</p>`;
    return;
  }
  let upload = await startUpload(md5);
  if (upload !== 1) {
    console.error("upload failed");
    return;
  }
  let result = await splitFileUpload(md5, file, div);
  if (result === 1) {
    div.innerHTML = `<p>${file.name}</p>
    <label ><progress  max="100" value="100"> </progress></label>
    <p>100.00%</p>`;
    div.innerHTML += `<p>上传成功</p>`;
    delete cacheUploadFile[md5];
  } else {
    div.innerHTML += `<p>上传失败</p>`;
  }
  // uploadSingleFile(file, div, md5);
};

function appendNode(div: HTMLDivElement) {
  let result = document.querySelector(".upload-result")!;
  let firstChild = result.firstChild;
  if (firstChild) {
    result.insertBefore(div, firstChild);
  } else {
    result.appendChild(div);
  }
}

function startUpload(md5: string) {
  return new Promise((resolve) => {
    fetch(`/api/upload/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        md5,
        uploaded: 0,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        resolve(json.data);
      })
      .catch(() => {
        resolve(0);
      });
  });
}
function finishUpload(
  md5: string,
  fileName: string,
  chunks: number,
  resolve: (data: 0 | 1) => void
) {
  fetch(`/api/upload/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      md5,
      fileName,
      chunks,
    }),
  })
    .then((res) => res.json())
    .then((json) => {
      resolve(json.data);
    })
    .catch(() => {
      resolve(0);
    });
}

interface IMessage {
  type: "finished" | "progress" | "error";
  hash: string;
  chunk: number;
  chunks: number;
}

function calcFileHash(file: File): Promise<string> {
  return new Promise((resolve) => {
    let worker = new Worker("/filehash.js");
    worker.postMessage({ file });
    worker.onmessage = (e: MessageEvent<IMessage>) => {
      const { type, hash, chunk, chunks } = e.data;
      console.log();
      if (type === "finished") {
        console.log("finished. hash:", hash);
        resolve(hash);
      } else if (type === "progress") {
        console.log(`${chunk}/${chunks}`);
      } else if (type === "error") {
        console.error("error");
        resolve("");
      }
    };
  });
}

function checkUploaded(md5: string): Promise<0 | 1> {
  return new Promise((resolve) => {
    fetch(`/api/upload?md5=${md5}`, {
      method: "GET",
    })
      .then((res) => res.json())
      .then((json) => {
        resolve(json.data);
      })
      .catch(() => {
        resolve(0);
      });
  });
}

function splitFileUpload(
  md5: string,
  file: File,
  div: HTMLDivElement,
  startChunk: number = 0
) {
  return new Promise((resolve) => {
    uploadCtrl[md5] = true;
    const blobSlice = File.prototype.slice;
    const chunkSize: number = 20 * 1024; // 1 * 1024 = 1KB
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk: number = startChunk;
    let endTime = 0;
    let startTime = 0;
    function loadNext() {
      if (!uploadCtrl[md5]) {
        return;
      }
      calcSpeed(
        startTime,
        endTime,
        currentChunk,
        chunkSize,
        div,
        file,
        chunks,
        md5
      );
      var start = currentChunk * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize;
      const fd = new FormData();
      fd.append("file", blobSlice.call(file, start, end));
      fd.append("chunk", String(currentChunk));
      fd.append("md5", md5);
      startTime = new Date().getTime();
      fetch("/api/upload/chunks", {
        method: "POST",
        body: fd,
      })
        .then((res) => res.json())
        .then(() => {
          endTime = new Date().getTime();
          cacheUploadFile[md5] = {
            file: file,
            div,
            currentChunk: currentChunk + 1,
          };
          currentChunk++;
          if (currentChunk < chunks) {
            loadNext();
          } else {
            console.log("upload finished");
            finishUpload(md5, file.name, chunks, resolve);
          }
        })
        .catch((err) => {
          console.error(err);
          resolve(0);
        });
    }
    loadNext();
  });
}

function calcSpeed(
  startTime: number,
  endTime: number,
  currentChunk: number,
  chunkSize: number,
  div: HTMLDivElement,
  file: File,
  chunks: number = 0,
  md5: string
) {
  let time = (endTime - startTime) / 1000;
  if (time === 0) return;
  let fileSize = file.size;
  let remainingSize = fileSize - currentChunk * chunkSize;
  let remainingTime = (remainingSize / chunkSize / time).toFixed(2) + "s";
  let speed = "";
  let mb = 1024 * 1024;
  let gb = 1024 * 1024 * 1024;
  if (chunkSize > 1024) {
    speed = (chunkSize / 1024 / time).toFixed(2) + "KB/s";
  } else if (chunkSize > mb) {
    speed = (chunkSize / mb / time).toFixed(2) + "MB/s";
  } else if (chunkSize > gb) {
    speed = (chunkSize / gb / time).toFixed(2) + "GB/s";
  }
  let progress = ((currentChunk / chunks) * 100).toFixed(2) + "%";
  div.innerHTML = `<p>${file.name}</p>
  <label ><progress  max=${chunks} value=${currentChunk}> </progress></label>
  <p>${progress}</p>
  <p>${speed}</p>
  <p>${remainingTime}</p>
  <button data-md5=${md5} class="upload-but p6">Stop</button>`;
}

document
  .querySelector(".upload-result")!
  .addEventListener("click", (event: Event) => {
    if (event !== null && event.target instanceof HTMLElement) {
      const dataset = event.target.dataset;
      if (!dataset.md5) return;
      if (uploadCtrl[dataset.md5]) {
        uploadCtrl[dataset.md5] = false;
        event.target.innerHTML = "Start";
      } else {
        uploadCtrl[dataset.md5] = true;
        event.target.innerHTML = "Stop";
        const { file, div, currentChunk } = cacheUploadFile[dataset.md5];
        splitFileUpload(dataset.md5, file, div, currentChunk);
      }
    }
  });

document.getElementById("stop-all")?.addEventListener("click", () => {
  Object.keys(uploadCtrl).forEach((md5) => {
    uploadCtrl[md5] = false;
  });
});
document.getElementById("start-all")?.addEventListener("click", () => {
  Object.keys(uploadCtrl).forEach((md5) => {
    if (!uploadCtrl[md5]) {
      uploadCtrl[md5] = true;
      const { file, div, currentChunk } = cacheUploadFile[md5];
      splitFileUpload(md5, file, div, currentChunk);
    }
  });
});
