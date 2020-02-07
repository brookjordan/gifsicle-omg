const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { execFile } = require("child_process");
const gifsicle = require("gifsicle");
const app = require("express")();

let uploadGif = multer({ dest: "i" })

function sendGif(request, resource, next) {
  let filePath = path.join(__dirname, request.global.gifPath);
  let fileType = "image/gif";
  let fileStream = fs.createReadStream(filePath);

  fileStream.on("open", () => {
    resource.set("Content-Type", fileType);
    fileStream.pipe(resource);
    fs.unlink(request.global.gifPath, _=>_);
    fs.unlink(request.global.gifPath.split('.')[0], _=>_);
  });

  fileStream.on("error", () => {
    resource.set("Content-Type", "text/plain");
    resource.status(404);
    resource.send("Not found");
    fs.unlink(request.global.gifPath, _=>_);
    fs.unlink(request.global.gifPat.split('.')[0], _=>_);
  });
};

if (!fs.existsSync("i")){ fs.mkdirSync("i"); }

app.use(require("cors")());

app.get("/", (request, resource, next) => {
  resource.status(200);
  resource.sendFile(path.join(__dirname, "index.html"));
});

app.post("/optimise",
  uploadGif.single("gif"),
  (request, resource, next) => {
    let compressedGifPath = `${request.file.path}.gif`;
    let options = [`--output=${compressedGifPath}`];
    if (+request.body.lossy) {
      options.push(`--lossy=${Math.round(request.body.lossy)}`);
    }
    if (
      request.body.optimize
      && request.body.optimize > 0 && request.body.optimize < 4
    ) {
      options.push(`--optimize=${Math.round(request.body.optimize)}`);
    }
    if (request.body.colors && +request.body.colors) {
      options.push(`--colors=${Math.round(request.body.colors)}`);
    }
    if (request.body.flip_horizontal && request.body.flip_horizontal.toLowerCase() === "true") {
      options.push("--flip-horizontal");
    }
    if (request.body.flip_vertical && request.body.flip_vertical.toLowerCase() === "true") {
      options.push("--flip-vertical");
    }
    if (+request.body.resize_x || +request.body.resize_y) {
      let resizeX = +request.body.resize_x;
      let resizeY = +request.body.resize_y || resizeX;
      resizeX = resizeX || resizeY;

      if (request.body.resize_type === "resize") {
        options.push(`--resize=${Math.min(800, resizeX)}x${Math.min(800, resizeY)}`);
      } else if (request.body.resize_type === "resize-fit") {
        options.push(`--resize-touch=${Math.min(800, resizeX)}x${Math.min(800, resizeY)}`);
      } else {
        options.push(`--scale=${Math.min(2, resizeX)}x${Math.min(2, resizeY)}`);
      }
    }
    if (+request.body.resize_colors || +request.body.resize_colors) {
      options.push(`--resize-colors=${+request.body.resize_colors}`);
    }
    if (
      request.body.color_method
      && ["diversity", "blend-diversity", "median-cut"].includes(request.body.color_method)
    ) {
      options.push(`--color-method=${request.body.color_method}`);
    }
    options.push(request.file.path);
    console.log(options);

    execFile(gifsicle, options, error => {
      if (error) { throw new Error(error); }
      (request.global || (request.global = {})).gifPath = compressedGifPath;
      next();
    });
  },
  sendGif,
);

app.get("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.post("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.listen(3000, () => {
  console.log(3000);
});
