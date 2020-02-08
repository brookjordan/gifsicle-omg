const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const multer = require("multer");
const childProcess = require("child_process");
const gifsicle = require("gifsicle");
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const exec = promisify(childProcess.exec);
const execFile = promisify(childProcess.execFile);

const app = require("express")();

let uploadGif = multer({ dest: path.join(__dirname, "i") })

function sendGif(request, resource, next) {
  let filePath = path.join(__dirname, "i", request.params.src);
  let fileType = "image/gif";
  let fileStream = fs.createReadStream(filePath);

  fileStream.on("open", () => {
    resource.set("Content-Type", fileType);
    fileStream.pipe(resource);
  });

  fileStream.on("error", () => {
    resource.set("Content-Type", "text/plain");
    resource.status(404);
    resource.send("Not found");
  });
};

let killedOnce = false;
function shutdown(signal) {
  return async err => {
    console.log(signal);
    if (killedOnce) { return process.exit(1); }
    console.log("Tidying up. Kill again to kill instantly.");
    killedOnce = true;

    if (err) console.error(err.stack || err);
    let killPromises = fs.readdirSync(path.join(__dirname, "i")).map(filePath => unlink(path.join("i", filePath)));
    await Promise.all(killPromises);
    process.exit(err ? 1 : 0);
  };
}
process
  .on("SIGTERM", shutdown("SIGTERM"))
  .on("SIGINT", shutdown("SIGINT"))
  .on("uncaughtException", shutdown("uncaughtException"));

if (!fs.existsSync("i")){ fs.mkdirSync("i"); }

app.use(require("cors")());

app.get("/", (request, resource, next) => {
  resource.status(200);
  resource.sendFile(path.join(__dirname, "index.html"));
});

app.get("/i/:src",
  sendGif,
);

const fileMetadata = require('file-metadata');
app.post("/optimise",
  uploadGif.single("gif"),
  async (request, resource, next) => {
    let compressedGifPath = `${request.file.path}.gif`;
    let framesWereDeleted = false;
    let options = [
      `--output=${compressedGifPath}`,
      `-U`,
    ];
    if (request.body.delete && request.body.delete !== "none") {
      let frameCount = (await exec(`identify -format "%n\n" ${request.file.path} | head -n 1`)).stdout.trim();
      let allFrames = Array.from({ length: frameCount }, (_, i) => i);
      let frames;
      switch (request.body.delete) {
        case "1/4":
          frames = allFrames.filter(i => i % 4 === 3);
          break;
        case "1/3":
          frames = allFrames.filter(i => i % 3 === 2);
          break;
        case "1/2":
          frames = allFrames.filter(i => i % 2 === 1);
          break;
        case "2/3":
          frames = allFrames.filter(i => i % 3 !== 0);
          break;
        case "3/4":
          frames = allFrames.filter(i => i % 4 !== 0);
          break;
      }
      if (frames && frames.length) {
        framesWereDeleted = true;
        options.push(
          request.file.path,
          "--delete",
          ...frames.map(a => `#${a}`),
          "--done",
        );
      }
    }

    // The following don’t work if frames are removed
    if (!framesWereDeleted) {
      [
        "flip-horizontal",
        "flip-vertical",
        "crop-transparency",
      ].forEach(booleans => {
        if (request.body[booleans]) {
          options.push(`--${booleans}`);
        }
      });
      if (request.body.rotate && +request.body.rotate) {
        options.push(`--rotate-${request.body.rotate}`);
      }
      if (request.body.crop_method) {
        let method = request.body.crop_method;
        let fromX = request.body.crop_x_from || 0;
        let toX = request.body.crop_x_to || 0;
        let fromY = request.body.crop_y_from || 0;
        let toY = request.body.crop_y_to || 0;

        if (fromX || toX || fromY || toY) {
          if (method === "trim") {
            options.push(`--crop=${fromX},${fromY}+-${toX}x-${toY}`);
          } else if (method === "to") {
            options.push(`--crop=${fromX},${fromY}-${toX},${toY}`);
          } else if (method === "size") {
            options.push(`--crop=${fromX},${fromY}+${toX}x${toY}`);
          }
        }
      }
    }

    if (+request.body.resize_colors || +request.body.resize_colors) {
      options.push(`--resize-colors=${+request.body.resize_colors}`);
    }
    [
      "conserve-memory",
      "no-conserve-memory",
      "interlace",
    ].forEach(booleans => {
      if (request.body[booleans]) {
        options.push(`--${booleans}`);
      }
    });
    if (request.body.colors && +request.body.colors) {
      options.push(`--colors=${Math.round(request.body.colors)}`);
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
    if (
      request.body.color_method
      && ["diversity", "blend-diversity", "median-cut"].includes(request.body.color_method)
    ) {
      options.push(`--color-method=${request.body.color_method}`);
    }
    if (request.body.dither) {
      options.push(`--dither=${request.body.dither}`);
    }
    if (+request.body.lossy) {
      options.push(`--lossy=${Math.round(request.body.lossy)}`);
    }
    if (
      request.body.optimize
      && request.body.optimize > 0 && request.body.optimize < 4
    ) {
      options.push(`--optimize=${Math.round(request.body.optimize)}`);
    }
    if (!framesWereDeleted) {
      options.push(request.file.path);
    }

    try {
      await execFile(gifsicle, options);
    } catch (error) {
      throw new Error(error);
    }

    let [
      originalGifStats,
      optimisedGifStats,
    ] = await Promise.all([
      stat(request.file.path),
      stat(compressedGifPath),
    ])

    console.log(`Original size: ${originalGifStats.size}`);
    console.log(`Optimised size: ${optimisedGifStats.size}`);

    resource.status(200);
    resource.send({
      src: `/i/${request.file.filename}.gif`,
      originalSize: originalGifStats.size,
      optimisedSize: optimisedGifStats.size,
      requestID: request.body.request_id,
    });

    setTimeout(() => {
      unlink(request.file.path, e => e);
      unlink(compressedGifPath, e => e);
    }, 60 * 1000);
  },
);

app.get("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.post("*", (request, resource, next) => {
  resource.status(404);
  resource.send("<h1>404</h1>");
});

app.listen(process.env.PORT || 3000, () => {
  console.log(process.env.PORT || 3000);
});
