const puppeteer = require('puppeteer');
const fs = require('fs').promises;

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

            // Calculate Friday to Friday dates
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
        .then((data) => {
            console.log('\n=== Room Pricing Scraping Complete ===');
            // console.log(`Dates: ${data.dates}`);
            // console.log(`Search: ${data.searchCriteria}`);
            // console.log(`Room options found: ${data.roomPricing?.length || 0}`);
            // console.log(`Total price: ${data.totalPrice}`);
            // console.log(`Price per night: ${data.pricePerNight}`);
        })
        .catch((error) => {
            console.error('Scraping failed:', error);
            // process.exit(1);
        });
}

module.exports = { scrapeHotelData };
