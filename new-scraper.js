const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Function to navigate to next month in calendar
async function navigateToNextMonth(page) {
    try {
        console.log('Navigating to next month...');
        
        // Wait for the next month button to be available
        await page.waitForSelector('.riu-datepicker__header--button:not(.riu-datepicker__header--button-hidden) button', { timeout: 5000 });
        
        // Find the next month button (right arrow) - only visible ones
        const nextMonthButton = await page.$('.riu-datepicker__header--button:not(.riu-datepicker__header--button-hidden) button[arialabel="Mes siguiente"]');
        
        if (nextMonthButton) {
            console.log('Found next month button, clicking...');
            
            // Try clicking the button
            try {
                await nextMonthButton.click();
                console.log('✓ Successfully navigated to next month');
            } catch (clickError) {
                console.log('Regular click failed, trying JavaScript click...');
                await page.evaluate(el => el.click(), nextMonthButton);
                console.log('✓ JavaScript clicked next month button');
            }
            
            // Wait for the calendar to update
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } else {
            console.log('Next month button not found');
            return false;
        }
    } catch (error) {
        console.error('Error navigating to next month:', error);
        return false;
    }
}

// Function to navigate to a specific month/year in calendar
async function navigateToTargetMonth(page, targetMonth, targetYear) {
    try {
        console.log(`Navigating to ${targetMonth}/${targetYear}...`);
        
        // Get current month/year displayed in calendar
        const getCurrentMonth = async () => {
            // Try to get the month from the rightmost (active) calendar first
            const monthElements = await page.$$('.riu-datepicker__header--selection strong');
            
            // Check each month element to find the one with visible navigation
            for (let i = monthElements.length - 1; i >= 0; i--) {
                const monthElement = monthElements[i];
                const monthText = await page.evaluate(el => el.textContent, monthElement);
                console.log(`Checking calendar: ${monthText}`);
                
                // Parse month/year from text (format varies, might be "September 2025" or similar)
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                 'July', 'August', 'September', 'October', 'November', 'December'];
                
                for (let j = 0; j < monthNames.length; j++) {
                    if (monthText.includes(monthNames[j])) {
                        const year = parseInt(monthText.match(/\d{4}/)?.[0] || new Date().getFullYear());
                        
                        // Find the parent article container
                        const parentArticle = await monthElement.evaluateHandle(el => {
                            let parent = el;
                            while (parent && parent.tagName !== 'ARTICLE') {
                                parent = parent.parentElement;
                            }
                            return parent;
                        });
                        
                        if (parentArticle) {
                            const hasVisibleNextButton = await parentArticle.evaluate(article => {
                                const nextButton = article.querySelector('.riu-datepicker__header--button:not(.riu-datepicker__header--button-hidden) button[arialabel="Mes siguiente"]');
                                return !!nextButton;
                            });
                            
                            console.log(`Calendar ${monthNames[j]} ${year} has visible next button: ${hasVisibleNextButton}`);
                            
                            // If this calendar has a visible next button, use this month
                            if (hasVisibleNextButton) {
                                console.log(`Found active calendar showing: ${monthNames[j]} ${year}`);
                                return { month: j, year: year };
                            }
                        }
                    }
                }
            }
            
            // Fallback to current date if no active calendar found
            const now = new Date();
            console.log('No active calendar found, using current date as fallback');
            return { month: now.getMonth(), year: now.getFullYear() };
        };
        
        let currentCalendar = await getCurrentMonth();
        console.log(`Current calendar shows: ${currentCalendar.month}/${currentCalendar.year}`);
        
        // Calculate how many months to navigate forward
        const monthsToNavigate = (targetYear - currentCalendar.year) * 12 + (targetMonth - currentCalendar.month);
        
        console.log(`Need to navigate ${monthsToNavigate} months (from ${currentCalendar.month}/${currentCalendar.year} to ${targetMonth}/${targetYear})`);
        
        if (monthsToNavigate < 0) {
            console.log('Target month is in the past relative to current active calendar');
            // If target is in the past, we might need to reset calendar or handle differently
            // For now, we'll assume the calendar is already showing the correct month
            return true;
        }
        
        if (monthsToNavigate === 0) {
            console.log('Already on target month');
            return true;
        }
        
        // Navigate forward month by month
        for (let i = 0; i < monthsToNavigate; i++) {
            const success = await navigateToNextMonth(page);
            if (!success) {
                console.log(`Failed to navigate forward ${i + 1} months`);
                return false;
            }
            
            // Small delay between navigations
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`✓ Successfully navigated to ${targetMonth}/${targetYear}`);
        return true;
    } catch (error) {
        console.error('Error navigating to target month:', error);
        return false;
    }
}

// Helper function to get all Friday-to-Friday date pairs for the next 6 months
function getFridayToFridayDatesFor6Months() {
    const dates = [];
    const today = new Date();
    
    // Start from the current month
    const startMonth = today.getMonth();
    const startYear = today.getFullYear();
    
    // Generate dates for the next 6 months
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const currentMonth = (startMonth + monthOffset) % 12;
        const currentYear = startYear + Math.floor((startMonth + monthOffset) / 12);
        
        // Get first and last day of the current month
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
        
        // Find the first Friday in this month
        let currentDate = new Date(firstDayOfMonth);
        while (currentDate.getDay() !== 5) { // 5 = Friday
            currentDate.setDate(currentDate.getDate() + 1);
            // If we've gone past the end of the month, skip this month
            if (currentDate > lastDayOfMonth) {
                break;
            }
        }
        
        // Generate all Friday-to-Friday pairs for this month
        while (currentDate <= lastDayOfMonth) {
            const checkIn = new Date(currentDate);
            const checkOut = new Date(currentDate);
            checkOut.setDate(checkOut.getDate() + 7); // Next Friday
            
            // Include the date pair regardless of which month check-out falls in
            dates.push({
                checkIn: checkIn,
                checkOut: checkOut,
                checkInDate: checkIn.getDate(),
                checkOutDate: checkOut.getDate(),
                checkInMonth: checkIn.getMonth(),
                checkOutMonth: checkOut.getMonth(),
                monthName: checkIn.toLocaleString('default', { month: 'long', year: 'numeric' })
            });
            
            // Move to next Friday
            currentDate.setDate(currentDate.getDate() + 7);
        }
    }
    
    return dates;
}

// Function to interact with the new calendar on results page
async function selectDatesOnResultsPage(page, checkInDate, checkOutDate, checkInMonth, checkOutMonth) {
    try {
        console.log(`\nSelecting new dates: Check-in ${checkInDate} (month ${checkInMonth}), Check-out ${checkOutDate} (month ${checkOutMonth})`);
        
        // Click on the date picker input to open the new calendar
        await page.waitForSelector('#datepicker-field', { timeout: 10000 });
        await page.click('#datepicker-field');
        console.log('Clicked new date picker to open calendar');
        
        // Wait for the new calendar to appear (different selector for new calendar)
        await page.waitForSelector('.riu-datepicker__content--days-group', { timeout: 5000 });
        console.log('New calendar opened');
        
        // Navigate to the correct month for check-in
        const today = new Date();
        const currentYear = today.getFullYear();
        const targetYear = checkInMonth < today.getMonth() ? currentYear + 1 : currentYear;
        
        const navigateSuccess = await navigateToTargetMonth(page, checkInMonth, targetYear);
        if (!navigateSuccess) {
            console.log(`Failed to navigate to target month ${checkInMonth}/${targetYear}`);
            return false;
        }
        
        // Function to click a specific date in the new calendar
        const clickDateInNewCalendar = async (day) => {
            // Updated selector for the new calendar structure
            const dateButtons = await page.$$('button.riu-datepicker__item--day:not(.riu-datepicker__item--disabled):not(.riu-datepicker__item--otherMonth)');
            
            for (let button of dateButtons) {
                const spanElement = await button.$('span');
                if (spanElement) {
                    const text = await page.evaluate(el => el.textContent, spanElement);
                    if (text.trim() === day.toString()) {
                        console.log(`Found date button for day ${day}, clicking...`);
                        
                        // Try multiple click strategies for the new calendar
                        try {
                            await button.click();
                            console.log(`✓ Clicked on date: ${day}`);
                        } catch (clickError) {
                            console.log(`Regular click failed for date ${day}, trying JavaScript click...`);
                            await page.evaluate(el => el.click(), button);
                            console.log(`✓ JavaScript clicked on date: ${day}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return true;
                    }
                }
            }
            
            console.log(`✗ Could not find clickable date: ${day}`);
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
        
        // Select check-in date
        console.log(`Attempting to select check-in date: ${checkInDate}`);
        const checkInSuccess = await clickDateInNewCalendar(checkInDate);
        if (!checkInSuccess) {
            console.log(`Failed to select check-in date: ${checkInDate}`);
            return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Navigate to check-out month if different from check-in month
        if (checkOutMonth !== checkInMonth) {
            const checkOutYear = checkOutMonth < checkInMonth ? targetYear + 1 : targetYear;
            const navigateToCheckOutSuccess = await navigateToTargetMonth(page, checkOutMonth, checkOutYear);
            if (!navigateToCheckOutSuccess) {
                console.log(`Failed to navigate to check-out month ${checkOutMonth}/${checkOutYear}`);
                return false;
            }
        }
        
        // Select check-out date
        console.log(`Attempting to select check-out date: ${checkOutDate}`);
        const checkOutSuccess = await clickDateInNewCalendar(checkOutDate);
        if (!checkOutSuccess) {
            console.log(`Failed to select check-out date: ${checkOutDate}`);
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

        // Calculate Friday to Friday dates (moved outside try block for broader scope)
        const today = new Date();
        const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
        
        // Calculate days until this Friday (or today if it's already Friday)
        let daysUntilFriday = (5 - currentDay + 7) % 7;
        if (daysUntilFriday === 0 && currentDay !== 5) {
            daysUntilFriday = 7; // If today is not Friday but calculation gives 0, it means next Friday
        }
        
        // Calculate check-in date (this Friday)
        const checkInDateObj = new Date(today);
        checkInDateObj.setDate(today.getDate() + daysUntilFriday);
        
        // Calculate check-out date (next Friday, 7 days later)
        const checkOutDateObj = new Date(checkInDateObj);
        checkOutDateObj.setDate(checkInDateObj.getDate() + 7);
         const checkInDate = checkInDateObj.getDate();
        const checkOutDate = checkOutDateObj.getDate();
        
        console.log(`Check-in: Friday, ${checkInDateObj.toDateString()} (${checkInDate})`);
        console.log(`Check-out: Friday, ${checkOutDateObj.toDateString()} (${checkOutDate})`);

        // Handle date selection
        console.log('Setting up date selection...');
        try {
            // Wait for the date picker to be available
            await page.waitForSelector('#search-bar-datepicker_input', { timeout: 10000 });
            console.log('Date picker input found');

            // Click on the date input to open the calendar
            await page.click('#search-bar-datepicker_input');
            console.log('Clicked date input to open calendar');

            // Wait for calendar to appear
            await page.waitForSelector('.riu-ui-calendar', { timeout: 5000 });
            console.log('Calendar opened');

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

        // Get all Friday-to-Friday date pairs for the next 6 months
        const allDatePairs = getFridayToFridayDatesFor6Months();
        console.log(`\nFound ${allDatePairs.length} Friday-to-Friday date pairs for the next 6 months:`);
        
        // Group by month for better display
        const datesByMonth = {};
        allDatePairs.forEach((datePair, index) => {
            if (!datesByMonth[datePair.monthName]) {
                datesByMonth[datePair.monthName] = [];
            }
            datesByMonth[datePair.monthName].push(datePair);
        });
        
        // Display all date pairs grouped by month
        Object.keys(datesByMonth).forEach(monthName => {
            console.log(`\n${monthName}:`);
            datesByMonth[monthName].forEach((datePair, index) => {
                console.log(`  ${index + 1}. ${datePair.checkIn.toDateString()} to ${datePair.checkOut.toDateString()}`);
            });
        });
        
        // Array to store all price results
        const priceResults = [];
        
        // Wait for the results page to load and extract first price
        console.log('\n=== GETTING FIRST PRICE ===');
        console.log('Waiting for room pricing to load...');
        
        const firstPrice = await extractPrice(page);
        console.log(`\nFirst price collected: ${firstPrice}`);
        
        // Now iterate through all the Friday-to-Friday dates for the next 6 months
        console.log('\n=== COLLECTING PRICES FOR ALL FRIDAY-TO-FRIDAY DATES (6 MONTHS) ===');
        
        for (let i = 0; i < allDatePairs.length; i++) {
            const datePair = allDatePairs[i];
            console.log(`\n--- Processing date pair ${i + 1}/${allDatePairs.length} ---`);
            console.log(`Check-in: ${datePair.checkIn.toDateString()} (${datePair.checkInDate})`);
            console.log(`Check-out: ${datePair.checkOut.toDateString()} (${datePair.checkOutDate})`);
            console.log(`Month: ${datePair.monthName}`);
            
            // Skip if this date pair matches the initial search dates
            if (datePair.checkInDate === checkInDate && datePair.checkOutDate === checkOutDate && 
                datePair.checkInMonth === checkInDateObj.getMonth()) {
                console.log(`⏭️  Skipping this date pair as it matches the initial search (${checkInDate}-${checkOutDate})`);
                // Still add the price we already collected for this date pair
                priceResults.push({
                    checkIn: datePair.checkIn,
                    checkOut: datePair.checkOut,
                    price: firstPrice
                });
                continue;
            }
            
            // Select the new dates with month navigation
            const dateSelectionSuccess = await selectDatesOnResultsPage(
                page, 
                datePair.checkInDate, 
                datePair.checkOutDate, 
                datePair.checkInMonth, 
                datePair.checkOutMonth
            );
            
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
        priceResults.forEach((result, index) => {
            console.log(`${index + 1}. ${result.checkIn.toDateString()} to ${result.checkOut.toDateString()}: ${result.price}`);
        });
        
        return priceResults;

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
        .then((priceResults) => {
            console.log('\n=== HOTEL PRICING SCRAPING COMPLETE ===');
            if (Array.isArray(priceResults)) {
                console.log(`Collected ${priceResults.length} price points:`);
                priceResults.forEach((result, index) => {
                    console.log(`${index + 1}. ${result.checkIn.toDateString()} to ${result.checkOut.toDateString()}: ${result.price}`);
                });
            } else {
                console.log(`Single price result: ${priceResults}`);
            }
        })
        .catch((error) => {
            console.error('Scraping failed:', error);
            // process.exit(1);
        });
}

module.exports = { scrapeHotelData };
