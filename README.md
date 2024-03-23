# VineHelper

Browser Extension to help identify import fees on items from Vine Canada.

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

**Note:** There will be an error about some lines in the _manifest.json_ file, you can safely ignore them as they are required for Mozilla. Or you can delete them. Up to you, won't change anything.
