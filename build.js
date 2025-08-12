const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

// Alternative directory removal function that handles corrupted files
function removeDir(dirPath) {
	if (!fs.existsSync(dirPath)) {
		return;
	}

	try {
		const files = fs.readdirSync(dirPath);
		for (const file of files) {
			const filePath = path.join(dirPath, file);
			try {
				const stat = fs.statSync(filePath);
				if (stat.isDirectory()) {
					removeDir(filePath);
				} else {
					fs.unlinkSync(filePath);
				}
			} catch (fileError) {
				console.warn(`Warning: Could not remove ${filePath}:`, fileError.message);
			}
		}
		fs.rmdirSync(dirPath);
	} catch (error) {
		console.warn(`Warning: Could not remove directory ${dirPath}:`, error.message);
	}
}

(async () => {
	console.log("Building...");
	// Remove dist directory using custom function to handle corrupted files
	removeDir("./dist");
	fs.cpSync("./page/", "./dist/page/", { recursive: true });
	fs.cpSync("./popup/", "./dist/popup/", { recursive: true });
	fs.cpSync("./resource/", "./dist/resource/", { recursive: true });
	fs.cpSync("./scripts/", "./dist/scripts/", { recursive: true });
	//fs.cpSync("./view/", "./dist/view/", { recursive: true });
	console.log("Removing .csj files...");
	const deleteCsjFiles = (dir) => {
		const files = fs.readdirSync(dir);
		for (const file of files) {
			const path = `${dir}/${file}`;
			const stat = fs.statSync(path);
			if (stat.isDirectory()) {
				deleteCsjFiles(path);
			} else if (file.endsWith(".cjs")) {
				fs.rmSync(path);
			}
		}
	};
	deleteCsjFiles("./dist");
	const platforms = ["firefox", "chrome", "ios"];
	for (const platform of platforms) {
		console.log(`Building ${platform} extension...`);
		fs.cpSync(`./manifest_${platform}.json`, "./dist/manifest.json");
		const output = fs.createWriteStream(__dirname + `/VH-${platform}-${pkg.version}.zip`);
		const archive = archiver("zip", {
			zlib: { level: 9 },
		});

		await new Promise((resolve) => {
			output.on("close", () => {
				resolve();
			});

			archive.pipe(output);
			archive.directory("./dist/", false);
			archive.finalize();
		});
	}

	console.log("Cleaning up...");
	removeDir("./dist");

	console.log("Complete!");
})();
