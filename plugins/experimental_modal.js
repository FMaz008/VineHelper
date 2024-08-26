/**
 * ========================== DEBUG - ONLOAD ==========================
 * This module alerts the user about the VineHelper's experimental feature.
 * It is intended for experimental purposes ONLY, hence the alert.
 *
 * So let's send a quick debug message for those that wnat to debug :)
 * ====================================================================
 *
 * Author: FrankyWNL
 * Copyright 2024, FrankyWNL <https://www.reddit.com/user/FrankyWNL/> for VineHelper
 */

/**
 * Tracks the index of the current active tile within the grid
 * Defaulted it to -1 to indicate no active tile initially (on load)
 *
 * @type {number}
 */
let currentIndex = -1;

/**
 * Tracks the index of the current active tile we want to navigate to
 * Defaulted to 0 to start from the first tile, unless another is clicked
 *
 * @type {number}
 */
let nextIndex = 0;

/**
 * Handles the click event on the detail button and stores both the index and ASIN code.
 *
 * @param {number} index - The index of the current tile
 * @param {string} asin - The ASIN code associated with the product/tile
 */
function handleTileButtonClick(index, asin) {
    currentIndex = index;
    console.log('[DEBUG] Tile clicked, current index: ', currentIndex, 'with ASIN:', asin);
}

/**
 * Closes popup modal and returns the Promise when it's finished
 *
 * @param {HTMLElement} modal - The modal that we need to close
 * @returns {Promise<void>} - A promise that resolves after it's closed
 */
function closeModal(modal) {
    return new Promise((resolve) => {
        console.log('[DEBUG] Closing modal...');
        modal.querySelector('button[data-action="a-popover-close"]').click();
        setTimeout(() => {
            console.log('[DEBUG] Modal closed!');
            resolve();
        }, 300);
    });
}

if (appSettings.general.modalNavigation) {
// Alert the user for experimental feature (debug only)
    console.log('%cExperimental feature loaded: VineHelper modal navigator',
        'color:#FFF;background:#F00;padding:8px;font-size:1.2rem');

    /**
     * Attach the 'click' eventListener to each yellow "See Details" button in the grid
     */
    document.querySelectorAll('.vvp-item-tile').forEach((tile, index) => {
        const button = tile.querySelector('.vvp-details-btn input');
        const asin = button.getAttribute('data-asin');

        button.addEventListener('click', function () {
            handleTileButtonClick(index, asin);
        });
    });

    /**
     * Adds a keydown eventListener for navigation through the modals;
     * Handles both left and right arrow key presses to navigate between the items in the grid
     */
    document.addEventListener('keydown', async function (event) {
        console.log('Key pressed:', event.key);

        /**
         * Let's check if the modal is open by looking for the (active) modal element on the page
         * If not, let's exit since there is nothing to click
         */
        let modal = document.querySelector('.a-popover-modal[aria-hidden="false"]');
        if (!modal) {
            console.log('[DEBUG] Modal not open, nothing to navigate through; ignoring!');
            return;
        }

        if (currentIndex === -1) {
            console.log('[DEBUG] There is no active tile; exiting');
            return; // Exit if there's no current tile tracked
        }

        /**
         * Figure out the previous/next index based on keyPress
         * We'll use the {document[...].length} to find the first/last item so we'll not run out of bounds
         */
        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % document.querySelectorAll('.vvp-item-tile').length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + document.querySelectorAll('.vvp-item-tile').length)
                % document.querySelectorAll('.vvp-item-tile').length;
        } else {
            console.log('[DEBUG] No left/right arrowkey pressed; exiting');
            return;
        }

        console.log('[DEBUG] Next index in the grid:', nextIndex);

        // Close the modal, await it, then continue
        await closeModal(modal);

        /**
         * Target the button with the correct {data-asin} and click it, baby!
         * HOWEVER, we require a delay of 600ms right now, perhaps fixable in a later release
         */
        setTimeout(() => {
            const nextTile = document.querySelectorAll('.vvp-item-tile')[nextIndex];
            const nextButton = nextTile.querySelector('.vvp-details-btn input');
            const nextAsin = nextButton.getAttribute('data-asin');

            if (nextButton) {
                console.log('[DEBUG] Trying to open modal with ASIN', nextAsin);
                nextButton.click();
            } else {
                console.log('[DEBUG] There is no such button, broken? ASIN:', nextAsin);
            }
        }, 600);

        // Finally update the current index
        currentIndex = nextIndex;
        console.log('[DEBUG] Updated the current index to:', currentIndex);
    });
}
