const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Helper function to get all Friday-to-Friday date pairs for 6 months from today
function getFridayToFridayDates() {
    const dates = [];
    const today = new Date();
    const startDate = new Date(today); // Start from today
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 6); // 6 months from today
    
    // Find the first Friday from start date
    let currentDate = new Date(startDate);
    while (currentDate.getDay() !== 5) { // 5 = Friday
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Generate all Friday-to-Friday pairs for 6 months
    while (currentDate <= endDate) {
        const checkIn = new Date(currentDate);
        const checkOut = new Date(currentDate);
        checkOut.setDate(checkOut.getDate() + 7); // Next Friday
        
        // Include if check-in is within our 6-month range from today
        if (checkIn <= endDate) {
            dates.push({
                checkIn: checkIn,
                checkOut: checkOut,
                checkInDate: checkIn.getDate(),
                checkOutDate: checkOut.getDate(),
                checkInMonth: checkIn.getMonth() + 1, // 1-based month
                checkOutMonth: checkOut.getMonth() + 1 // 1-based month
            });
        }
        
        // Move to next Friday
        currentDate.setDate(currentDate.getDate() + 7);
    }
    
    return dates;
}

// Helper function to navigate calendar to show a specific month
async function navigateCalendarToMonth(page, targetMonthNumber) {
    try {
        console.log(`Navigating calendar to show month ${targetMonthNumber}`);
        
        const monthNames = {
            1: 'January',
            2: 'February', 
            3: 'March',
            4: 'April',
            5: 'May',
            6: 'June',
            7: 'July',
            8: 'August',
            9: 'September',
            10: 'October', 
            11: 'November',
            12: 'December'
        };
        
        const targetMonthName = monthNames[targetMonthNumber];
        if (!targetMonthName) {
            console.log(`Unknown month number: ${targetMonthNumber}`);
            return false;
        }
        
        // Check if target month is already visible
        let monthHeaders = await page.$$eval('.riu-datepicker__header--selection strong', 
            elements => elements.map(el => el.textContent.trim())
        );
        
        console.log('Current months before navigation:', monthHeaders);
        
        // If target month is already visible, we're good
        if (monthHeaders.some(month => month.includes(targetMonthName))) {
            console.log(`✓ ${targetMonthName} is already visible`);
            return true;
        }
        
        // Navigate forward to find the target month (max 6 attempts to avoid infinite loop)
        let attempts = 0;
        const maxAttempts = 6;
        
        while (attempts < maxAttempts) {
            // Check if we can navigate forward
            const rightArrows = await page.$$('button[arialabel="Mes siguiente"]:not([disabled])');
            if (rightArrows.length === 0) {
                console.log('No forward navigation button available');
                break;
            }
            
            console.log(`Navigation attempt ${attempts + 1}: Clicking right arrow`);
            await rightArrows[0].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if target month is now visible
            monthHeaders = await page.$$eval('.riu-datepicker__header--selection strong', 
                elements => elements.map(el => el.textContent.trim())
            );
            
            console.log('Months after navigation:', monthHeaders);
            
            if (monthHeaders.some(month => month.includes(targetMonthName))) {
                console.log(`✓ Successfully navigated to ${targetMonthName}`);
                return true;
            }
            
            attempts++;
        }
        
        console.log(`Could not navigate to ${targetMonthName} after ${attempts} attempts`);
        return false;
        
    } catch (error) {
        console.log('Error navigating calendar:', error);
        return false;
    }
}

// Helper function to navigate calendar to show the desired months
async function ensureCorrectMonthsVisible(page, targetMonth1 = null, targetMonth2 = null) {
    try {
        // Get current visible months
        const monthHeaders = await page.$$eval('.riu-datepicker__header--selection strong', 
            elements => elements.map(el => el.textContent.trim())
        );
        
        console.log('Current visible months:', monthHeaders);
        
        // If no specific months requested, just return true (keep current calendar state)
        if (!targetMonth1 && !targetMonth2) {
            console.log('No specific months requested, keeping current calendar state');
            return true;
        }
        
        // Check if target months are visible
        const hasTargetMonth1 = targetMonth1 ? monthHeaders.some(month => month.includes(targetMonth1)) : true;
        const hasTargetMonth2 = targetMonth2 ? monthHeaders.some(month => month.includes(targetMonth2)) : true;
        
        if (hasTargetMonth1 && hasTargetMonth2) {
            console.log(`✓ Target months are visible: ${targetMonth1 || 'Any'}, ${targetMonth2 || 'Any'}`);
            return true;
        }
        
        // If not both months are visible, we might need to navigate
        console.log(`Need to navigate to show target months: ${targetMonth1 || 'Any'}, ${targetMonth2 || 'Any'}`);
        
        // Try clicking the right arrow to navigate if needed
        const rightArrows = await page.$$('button[arialabel="Mes siguiente"]:not([disabled])');
        if (rightArrows.length > 0) {
            console.log('Clicking right arrow to navigate calendar');
            await rightArrows[0].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check again
            const newMonthHeaders = await page.$$eval('.riu-datepicker__header--selection strong', 
                elements => elements.map(el => el.textContent.trim())
            );
            console.log('Months after navigation:', newMonthHeaders);
        }
        
        return true;
    } catch (error) {
        console.log('Error ensuring correct months visible:', error);
        return false;
    }
}

// Function to interact with the new calendar on results page
async function selectDatesOnResultsPage(page, checkInDate, checkOutDate, checkInMonth, checkOutMonth) {
    try {
        console.log(`\nSelecting new dates: Check-in ${checkInDate}/${checkInMonth}, Check-out ${checkOutDate}/${checkOutMonth}`);
        
        // Click on the date picker input to open the new calendar
        await page.waitForSelector('#datepicker-field', { timeout: 10000 });
        await page.click('#datepicker-field');
        console.log('Clicked new date picker to open calendar');
        
        // Wait for the new calendar to appear (different selector for new calendar)
        await page.waitForSelector('.riu-datepicker__content--days-group', { timeout: 5000 });
        console.log('New calendar opened');
        
        // Ensure we're viewing September and October
        await ensureCorrectMonthsVisible(page);
        
        // Function to click a specific date in the new calendar
        const clickDateInNewCalendar = async (day, monthNumber) => {
            console.log(`Looking for day ${day} in month ${monthNumber}`);
            
            // Define monthNames locally within this function
            const monthNames = {
                1: 'January',
                2: 'February', 
                3: 'March',
                4: 'April',
                5: 'May',
                6: 'June',
                7: 'July',
                8: 'August',
                9: 'September',
                10: 'October', 
                11: 'November',
                12: 'December'
            };
            
            // First, ensure the target month is visible by navigating if needed
            const navigationSuccess = await navigateCalendarToMonth(page, monthNumber);
            if (!navigationSuccess) {
                console.log(`Failed to navigate to month ${monthNumber}, trying to continue anyway...`);
            }
            
            // Get all calendar containers
            const calendarArticles = await page.$$('.riu-datepicker > article');
            
            if (calendarArticles.length < 2) {
                console.log('Expected 2 calendar months but found:', calendarArticles.length);
                return false;
            }
            
            // First, let's detect what months are actually shown in each calendar
            const calendarMonths = [];
            for (let i = 0; i < calendarArticles.length; i++) {
                try {
                    const monthHeader = await calendarArticles[i].$eval('.riu-datepicker__header--selection strong', 
                        el => el.textContent.trim()
                    );
                    calendarMonths.push(monthHeader);
                    console.log(`Calendar ${i} shows: ${monthHeader}`);
                } catch (e) {
                    console.log(`Could not read month header for calendar ${i}`);
                    calendarMonths.push('Unknown');
                }
            }
            
            // Determine which calendar to use based on the actual month headers
            let calendarIndex = 0; // Default to left calendar
            
            // Look for the calendar that contains our target month
            const targetMonthName = monthNames[monthNumber] || `Month ${monthNumber}`;
            
            for (let i = 0; i < calendarMonths.length; i++) {
                if (calendarMonths[i].includes(targetMonthName)) {
                    calendarIndex = i;
                    console.log(`Found ${targetMonthName} in calendar ${i}`);
                    break;
                }
            }
            
            // Special handling: for October dates, prefer the left calendar if both calendars show October
            if (monthNumber === 10) {
                const leftHasOctober = calendarMonths[0] && calendarMonths[0].includes('October');
                if (leftHasOctober) {
                    calendarIndex = 0;
                    console.log(`Using left calendar for October date since it's available there`);
                }
            }
            
            const targetCalendar = calendarArticles[calendarIndex];
            console.log(`Using calendar index ${calendarIndex} for month ${monthNumber} (${targetMonthName})`);
            
            // Get the month header to verify we're looking at the right calendar
            try {
                const monthHeader = await targetCalendar.$eval('.riu-datepicker__header--selection strong', 
                    el => el.textContent.trim()
                );
                console.log(`Selected calendar ${calendarIndex} shows: ${monthHeader}`);
            } catch (e) {
                console.log('Could not read month header for selected calendar', calendarIndex);
            }
            
            // Find date buttons within the specific calendar
            const dateButtons = await targetCalendar.$$('button.riu-datepicker__item--day:not(.riu-datepicker__item--disabled):not(.riu-datepicker__item--otherMonth)');
            
            console.log(`Found ${dateButtons.length} clickable date buttons in calendar ${calendarIndex}`);
            
            for (let button of dateButtons) {
                const spanElement = await button.$('span');
                if (spanElement) {
                    const text = await page.evaluate(el => el.textContent, spanElement);
                    if (text.trim() === day.toString()) {
                        console.log(`Found date button for day ${day} in month ${monthNumber}, clicking...`);
                        
                        // Scroll the button into view first
                        await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), button);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Try multiple click strategies for the new calendar
                        try {
                            await button.click();
                            console.log(`✓ Clicked on date: ${day}/${monthNumber}`);
                        } catch (clickError) {
                            console.log(`Regular click failed for date ${day}/${monthNumber}, trying JavaScript click...`);
                            await page.evaluate(el => el.click(), button);
                            console.log(`✓ JavaScript clicked on date: ${day}/${monthNumber}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return true;
                    }
                }
            }
            
            console.log(`✗ Could not find clickable date: ${day}/${monthNumber}`);
            return false;
        };
        
        // Clear any existing selection first by clicking on a safe area
        try {
            const calendarHeader = await page.$('.riu-datepicker__header');
            if (calendarHeader) {
                await calendarHeader.click();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (e) {
            console.log('Could not clear existing selection');
        }
        
        // Ensure the correct months are visible
        await ensureCorrectMonthsVisible(page);
        
        // Select check-in date
        console.log(`Attempting to select check-in date: ${checkInDate}/${checkInMonth}`);
        const checkInSuccess = await clickDateInNewCalendar(checkInDate, checkInMonth);
        if (!checkInSuccess) {
            console.log(`Failed to select check-in date: ${checkInDate}/${checkInMonth}`);
            return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Select check-out date
        console.log(`Attempting to select check-out date: ${checkOutDate}/${checkOutMonth}`);
        const checkOutSuccess = await clickDateInNewCalendar(checkOutDate, checkOutMonth);
        if (!checkOutSuccess) {
            console.log(`Failed to select check-out date: ${checkOutDate}/${checkOutMonth}`);
            return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Click the search button to submit the new date selection
        console.log('Looking for search button to submit new dates...');
        try {
            // Wait for the search button to be available
            await page.waitForSelector('#search-button', { timeout: 5000 });
            const searchButton = await page.$('#search-button');
            
            if (searchButton) {
                console.log('Found search button, clicking to submit new dates...');
                
                // Check if button is clickable
                const buttonState = await page.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return {
                        isVisible: rect.width > 0 && rect.height > 0,
                        isEnabled: !el.disabled,
                        offsetParent: !!el.offsetParent
                    };
                }, searchButton);
                
                console.log('Search button state:', buttonState);
                
                if (buttonState.isVisible && buttonState.isEnabled) {
                    // Try clicking the search button
                    try {
                        await searchButton.click();
                        console.log('✓ Clicked search button successfully');
                    } catch (clickError) {
                        console.log('Regular click failed, trying JavaScript click...');
                        await page.evaluate(el => el.click(), searchButton);
                        console.log('✓ JavaScript clicked search button');
                    }
                    
                    // Wait for the page to update with new prices
                    console.log('Waiting for page to update with new prices...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Wait for potential navigation or content update
                    try {
                        await page.waitForFunction(
                            () => document.querySelector('.room-footer__price-final'),
                            { timeout: 10000 }
                        );
                        console.log('Price section found, prices should be updated');
                    } catch (e) {
                        console.log('Timeout waiting for price update, continuing...');
                    }
                } else {
                    console.log('Search button is not clickable');
                    return false;
                }
            } else {
                console.log('Search button not found');
                return false;
            }
        } catch (error) {
            console.error('Error clicking search button:', error);
            return false;
        }
        
        // Close the calendar by clicking outside or pressing escape
        try {
            await page.keyboard.press('Escape');
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            console.log('Could not close calendar with Escape key');
        }
        
        // Wait for price update
        console.log('Waiting for final price update...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return true;
    } catch (error) {
        console.error('Error selecting dates on results page:', error);
        return false;
    }
}

// Function to extract price from the current page
async function extractPrice(page) {
    try {
        await page.waitForSelector('.room-footer__price-final', { timeout: 15000 });
        
        const priceData = await page.evaluate(() => {
            const priceElement = document.querySelector('.room-footer__price-final .room-footer__price-final__content strong');
            if (priceElement) {
                const priceText = priceElement.textContent.trim();
                const currencyElement = priceElement.nextElementSibling;
                const currency = currencyElement ? currencyElement.textContent.trim() : '';
                return {
                    price: priceText,
                    currency: currency,
                    fullPrice: `${priceText} ${currency}`
                };
            }
            return null;
        });

        if (priceData) {
            console.log(`Found price: ${priceData.fullPrice}`);
            return priceData.fullPrice;
        } else {
            console.log('No price found');
            return 'Price not found';
        }
    } catch (error) {
        console.error('Error extracting price:', error);
        return 'Error extracting price';
    }
}

async function scrapeHotelData() {
    const browser = await puppeteer.launch({
        headless: false, // Set to true for production
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        
        // Set user agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        console.log('Navigating to RIU Hotel page...');
        await page.goto('https://www.riu.com/en/hotel/united-states/miami-beach/hotel-riu-plaza-miami-beach', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait for the page to load completely
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Handle cookie consent first
        console.log('Checking for cookie consent banner...');
        try {
            // Wait for cookie banner to appear and click accept
            const cookieAcceptButton = await page.$('#onetrust-accept-btn-handler');
            if (cookieAcceptButton) {
                console.log('Found cookie consent banner, accepting cookies...');
                await cookieAcceptButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for banner to disappear
                console.log('Cookies accepted');
            } else {
                console.log('No cookie banner found, proceeding...');
            }
        } catch (e) {
            console.log('Could not handle cookie consent:', e.message);
        }

        // Handle discount modals that may appear after cookie acceptance
        console.log('Checking for discount modals...');
        let couponData = null;
        try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for potential modal to appear
            
            // Check for RIU Class Loyalty Sale modal
            const modalContent = await page.$('.dy-modal-content');
            if (modalContent) {
                const title = await page.$eval('#dy-modal-title', el => el.textContent.trim()).catch(() => '');
                const message = await page.$eval('#dy-modal-message', el => el.textContent.trim()).catch(() => '');
                
                // Extract discount percentage and promo code from message
                const discountMatch = message.match(/(\d+)%\s*off/i);
                const promoMatch = message.match(/promo code\s+([A-Z0-9]+)/i);
                
                couponData = {
                    title: title,
                    discount: discountMatch ? discountMatch[1] + '% off' : 'Unknown discount',
                    promoCode: promoMatch ? promoMatch[1] : 'No promo code found',
                    fullMessage: message
                };
                
                console.log('🎟️ COUPON DETECTED:', couponData);
            }
            
            // Click outside any modal to dismiss it
            await page.click('body', { delay: 100 });
            console.log('Clicked outside to dismiss any discount modals');
            
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for modal to disappear
        } catch (e) {
            console.log('Could not handle discount modal:', e.message);
        }

        // Get all Friday-to-Friday date pairs for 6 months from today
        const allDatePairs = getFridayToFridayDates();
        
        // Use the first date pair from our 6-month range as the initial search
        // This prevents duplication and ensures we start with the correct range
        const firstDatePair = allDatePairs[0];
        const checkInDateObj = firstDatePair.checkIn;
        const checkOutDateObj = firstDatePair.checkOut;
        const checkInDate = checkInDateObj.getDate();
        const checkOutDate = checkOutDateObj.getDate();
        
        console.log(`Check-in: Friday, ${checkInDateObj.toDateString()} (${checkInDate})`);
        console.log(`Check-out: Friday, ${checkOutDateObj.toDateString()} (${checkOutDate})`);

        // Handle date selection
        console.log('Setting up date selection...');
        try {
            // Wait for the date picker to be available - try multiple selectors
            console.log('Looking for date picker input...');
            let datePickerInput = null;
            
            // Try different selectors for the date picker
            const selectors = [
                '#search-bar-datepicker_input',
                'input[id="search-bar-datepicker_input"]',
                '.riu-ui-calendar__field input',
                'input[placeholder*="Select the dates"]'
            ];
            
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    datePickerInput = await page.$(selector);
                    if (datePickerInput) {
                        console.log(`Date picker input found with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    console.log(`Selector ${selector} not found, trying next...`);
                }
            }
            
            if (!datePickerInput) {
                throw new Error('Could not find date picker input with any selector');
            }

            // Click on the date input to open the calendar
            console.log('Clicking date input to open calendar...');
            
            // Try clicking the calendar icon first
            try {
                const calendarIcon = await page.$('.riu-ui-calendar .riu-ui-icon i.icon-calendar');
                if (calendarIcon) {
                    console.log('Found calendar icon, clicking it...');
                    await calendarIcon.click();
                } else {
                    await datePickerInput.click();
                }
            } catch (e) {
                console.log('Calendar icon not found, clicking input field...');
                await datePickerInput.click();
            }
            
            // Wait a moment for the calendar to start opening
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to click again if calendar hasn't opened
            try {
                await page.waitForSelector('.riu-ui-calendar', { timeout: 2000 });
                console.log('Calendar opened on first click');
            } catch (e) {
                console.log('Calendar not opened on first click, trying again...');
                await datePickerInput.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Wait for calendar to appear with multiple possible selectors
            const calendarSelectors = [
                '.riu-ui-calendar',
                '.riu-ui-calendar__content',
                '.riu-ui-calendar__item--day'
            ];
            
            let calendarFound = false;
            for (const selector of calendarSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    console.log(`Calendar found with selector: ${selector}`);
                    calendarFound = true;
                    break;
                } catch (e) {
                    console.log(`Calendar selector ${selector} not found, trying next...`);
                }
            }
            
            if (!calendarFound) {
                throw new Error('Calendar did not open after clicking date input');
            }

            console.log(`Check-in: Friday, ${checkInDateObj.toDateString()} (${checkInDate})`);
            console.log(`Check-out: Friday, ${checkOutDateObj.toDateString()} (${checkOutDate})`);

            // Function to click a specific date
            const clickDate = async (day) => {
                const dateSelector = `.riu-ui-calendar__item--day:not(.riu-ui-calendar__item--disabled):not(.riu-ui-calendar__item--otherMonth) span:contains("${day}")`;
                
                // Find and click the date
                const dateButtons = await page.$$('.riu-ui-calendar__item--day:not(.riu-ui-calendar__item--disabled):not(.riu-ui-calendar__item--otherMonth)');
                
                for (let button of dateButtons) {
                    const spanElement = await button.$('span');
                    if (spanElement) {
                        const text = await page.evaluate(el => el.textContent, spanElement);
                        if (text.trim() === day.toString()) {
                            await button.click();
                            console.log(`Clicked on date: ${day}`);
                            return true;
                        }
                    }
                }
                return false;
            };

            // Select check-in date
            console.log(`Selecting check-in date: ${checkInDate}`);
            await clickDate(checkInDate);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between clicks

            // Select check-out date
            console.log(`Selecting check-out date: ${checkOutDate}`);
            await clickDate(checkOutDate);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Wait for the date selection to be processed
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Click the search button to proceed to the next page
            try {
                // Wait for and click the specific search button
                await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
                const searchButton = await page.$('button[type="submit"]');
                
                console.log(searchButton)
                if (searchButton) {
                    // Get the HTML content of the search button
                    const buttonHTML = await page.evaluate(el => el.outerHTML, searchButton);
                    console.log('Search button HTML:');
                    console.log(buttonHTML);
                    
                    // Check if button is enabled and visible
                    const buttonState = await page.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        return {
                            isVisible: rect.width > 0 && rect.height > 0,
                            isEnabled: !el.disabled,
                            hasClickHandler: !!el.onclick,
                            offsetParent: !!el.offsetParent
                        };
                    }, searchButton);
                    console.log('Button state:', buttonState);
                    
                    // Ensure button is clickable
                    if (!buttonState.isVisible || !buttonState.isEnabled) {
                        console.log('Button is not clickable, waiting a bit more...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                    console.log('Found search button, clicking to proceed to next page...');
                    
                    // Get current URL before clicking
                    const currentUrl = page.url();
                    console.log('Current URL before click:', currentUrl);
                    
                    // Try multiple click strategies
                    try {
                        // Strategy 1: Regular click
                        await searchButton.click();
                        console.log('Clicked search button with regular click');
                    } catch (clickError) {
                        console.log('Regular click failed, trying JavaScript click...');
                        // Strategy 2: JavaScript click
                        await page.evaluate(el => el.click(), searchButton);
                        console.log('Clicked search button with JavaScript click');
                    }
                    
                    // Wait a moment to see if navigation starts
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Check if URL changed
                    const newUrl = page.url();
                    console.log('URL after click:', newUrl);
                    
                    if (newUrl !== currentUrl) {
                        console.log('URL changed, navigation in progress...');
                        // Wait for navigation to complete
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                        console.log('Successfully navigated to search results page');
                    } else {
                        console.log('URL did not change, navigation may not have started');
                        // Try clicking again with more force
                        console.log('Attempting second click...');
                        await page.evaluate(el => {
                            el.scrollIntoView();
                            el.focus();
                            el.click();
                        }, searchButton);
                        
                        // Wait for potential navigation
                        try {
                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
                            console.log('Successfully navigated after second attempt');
                        } catch (navError) {
                            console.log('Navigation did not occur after second click attempt');
                        }
                    }
                } else {
                    console.log('Search button not found');
                }
            } catch (e) {
                console.log('Could not find or click search button:', e.message);
            }

            console.log('Date selection completed');

        } catch (error) {
            console.error('Error setting dates:', error);
            // Continue with scraping even if date selection fails
        }

        console.log(`\nFound ${allDatePairs.length} Friday-to-Friday date pairs for 6 months from today:`);
        
        // Display all date pairs
        allDatePairs.forEach((datePair, index) => {
            console.log(`${index + 1}. ${datePair.checkIn.toDateString()} to ${datePair.checkOut.toDateString()}`);
        });
        
        // Wait for the results page to load and extract first price
        console.log('\n=== GETTING FIRST PRICE ===');
        console.log('Waiting for room pricing to load...');
        
        const firstPrice = await extractPrice(page);
        console.log(`\nFirst price collected for ${checkInDateObj.toDateString()} to ${checkOutDateObj.toDateString()}: ${firstPrice}`);
        
        // Add the first price to results (Array to store all price results)
        const priceResults = [{
            checkIn: checkInDateObj,
            checkOut: checkOutDateObj,
            price: firstPrice
        }];
        
        // Now iterate through the remaining 6-month Friday-to-Friday dates (skip the first one)
        console.log('\n=== COLLECTING PRICES FOR REMAINING DATES ===');
        
        for (let i = 1; i < allDatePairs.length; i++) {
            const datePair = allDatePairs[i];
            console.log(`\n--- Processing date pair ${i + 1}/${allDatePairs.length} ---`);
            console.log(`Check-in: ${datePair.checkIn.toDateString()} (${datePair.checkInDate}/${datePair.checkInMonth})`);
            console.log(`Check-out: ${datePair.checkOut.toDateString()} (${datePair.checkOutDate}/${datePair.checkOutMonth})`);
            
            // Select the new dates
            const dateSelectionSuccess = await selectDatesOnResultsPage(page, datePair.checkInDate, datePair.checkOutDate, datePair.checkInMonth, datePair.checkOutMonth);
            
            if (dateSelectionSuccess) {
                // Extract the price for this date pair
                const price = await extractPrice(page);
                priceResults.push({
                    checkIn: datePair.checkIn,
                    checkOut: datePair.checkOut,
                    price: price
                });
                
                console.log(`✓ Price for ${datePair.checkIn.toDateString()} to ${datePair.checkOut.toDateString()}: ${price}`);
            } else {
                console.log(`✗ Failed to select dates for ${datePair.checkIn.toDateString()} to ${datePair.checkOut.toDateString()}`);
                priceResults.push({
                    checkIn: datePair.checkIn,
                    checkOut: datePair.checkOut,
                    price: 'Failed to get price'
                });
            }
            
            // Wait between requests to avoid being too aggressive
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Display final results
        console.log('\n=== FINAL PRICE SUMMARY ===');
        if (couponData) {
            console.log('🎟️ COUPON OFFER:', `${couponData.discount} with code: ${couponData.promoCode}`);
        }
        priceResults.forEach((result, index) => {
            console.log(`${index + 1}. ${result.checkIn.toDateString()} to ${result.checkOut.toDateString()}: ${result.price}`);
        });
        
        return { 
            prices: priceResults, 
            coupon: couponData 
        };

    } catch (error) {
        console.error('Error scraping hotel data:', error);
        throw error;
    } finally {
    // await browser.close();
    }
}

// Run the scraper
if (require.main === module) {
    scrapeHotelData()
        .then((results) => {
            console.log('\n=== HOTEL PRICING SCRAPING COMPLETE ===');
            if (results.coupon) {
                console.log(`🎟️ COUPON FOUND: ${results.coupon.discount} with code: ${results.coupon.promoCode}`);
            }
            if (Array.isArray(results.prices)) {
                console.log(`Collected ${results.prices.length} price points:`);
                results.prices.forEach((result, index) => {
                    console.log(`${index + 1}. ${result.checkIn.toDateString()} to ${result.checkOut.toDateString()}: ${result.price}`);
                });
            } else {
                console.log(`Single price result: ${results}`);
            }
        })
        .catch((error) => {
            console.error('Scraping failed:', error);
            // process.exit(1);
        });
}

module.exports = { scrapeHotelData };