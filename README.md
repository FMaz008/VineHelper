# VineHelper

Browser Extension to improve the experience of Amazon Vine members.

## Official Releases:

**Chrome webstore**: https://chromewebstore.google.com/detail/jlglbhebbkfjcofdplbkanckkipkgfle
**Mozilla Add-ons**: https://addons.mozilla.org/en-CA/firefox/addon/amazon-vine-helper/

## Contributing

### Requirements

You must have [node.js](https://nodejs.org/en/download) installed. This project uses the [yarn classic](https://classic.yarnpkg.com/) package manager.

```
npm install -g yarn
```

### Getting Started

```
git clone git@github.com:FMaz008/VineHelper.git
cd VineHelper
yarn
```

### Testing / Installing Manually

#### Firefox

1. In Firefox, go to `about:debugging#/runtime/this-firefox`
2. click "Load Temporary Add-on..."
3. open the folder with the unzipped files in it and select the _manifest.json_ file.

#### Chrome

1. In Chrome, go to `chrome://extensions/`
2. enable Developer mode on the right of the page,
3. then click "Load Unpacked".
4. select the folder with the unzipped files in it

**Note:** If testing locally with the default manifest.json file, your browser will likely give you errors, as the test manifest.json file is a mix of the settings for Chrome and Firefox. The extension should work fine despite these errors. Released versions use the proper manifest file for each browser.
