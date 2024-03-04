var appSettings = {}; //Top of the file

async function loadSettings(){
  const data = await chrome.storage.local.get("settings");
  Object.assign(appSettings, data.settings);
}
loadSettings();

function init_review() {
    let currentUrl = window.location.href;
    let regex = /https:\/\/www\.amazon\.co\.uk\/(review\/create-review|reviews\/create-review).*/;
    if (regex.test(currentUrl)) {
        boot_review();
    }
}

function boot_review() {
    function addButtonWhenContainerAvailable() {
        const container = document.querySelector('div[data-hook="ryp-review-text-input"]');
        if (container) {
            const insertTitleButton = document.createElement('button');
            insertTitleButton.textContent = 'Insert Product Title';
            insertTitleButton.className = 'custom-button';
            insertTitleButton.style = 'cursor: pointer; margin-top: 10px;';
            insertTitleButton.onclick = insertProductTitle;
            container.appendChild(insertTitleButton);

        } else {
            console.error('Container not found. This script may not work on this page.');
        }
    }

    waitForElement('div[data-hook="ryp-review-text-input"]', addButtonWhenContainerAvailable);
}

function waitForElement(selector, callback) {
    const observer = new MutationObserver(function(mutations, me) {
        if (document.querySelector(selector)) {
            callback();
            me.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}


/** 
 * @desc reused code from old project
 * @link https://github.com/wattsoner/Vine-Review-Helper/blob/main/AmazonReviewHelper.user.js#L144
 */

function insertProductTitle() {
    console.log(appSettings);

    if (appSettings.reviews.showProductTitle == true) {

    const reviewTextArea = document.querySelector('textarea[id="scarface-review-text-card-title"]');
    const productTitleElement = document.querySelector('span[data-hook="ryp-product-title"]');
    if (reviewTextArea && productTitleElement) {
        const productTitle = productTitleElement.innerText;
        if (document.selection) { 
            reviewTextArea.focus();
            var sel = document.selection.createRange();
            sel.text = productTitle;
            reviewTextArea.focus();
        } else if (reviewTextArea.selectionStart || reviewTextArea.selectionStart === '0') {
            var startPos = reviewTextArea.selectionStart;
            var endPos = reviewTextArea.selectionEnd;
            var beforeText = reviewTextArea.value.substring(0, startPos);
            var afterText = reviewTextArea.value.substring(endPos, reviewTextArea.value.length);
            reviewTextArea.value = beforeText + productTitle + afterText;
            reviewTextArea.focus();
            reviewTextArea.selectionStart = startPos + productTitle.length;
            reviewTextArea.selectionEnd = startPos + productTitle.length;
        } else {
            reviewTextArea.value += productTitle;
            reviewTextArea.focus();
        }
    }
}}

init_review();




