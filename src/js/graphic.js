import utils from './utils';
import $ from 'jquery'
import slider from 'jquery-ui/ui/widgets/slider'

import * as markerAnimation from './marker'

import tileChartCreator from './tileChart'
import timelineCreator from './timeline'
import sunburstCreator from './sunburst'
import isMobile from "./utils/is-mobile";

import "intersection-observer";
import scrollama from "scrollama";
/* global d3 */
function resize() {}

// ======== GLOBALS ======== //
let officerDisciplineResults = null;
let complaintSummaries = {};


let phoneBrowsing = (isMobile.any() == null) ? false : true;
let vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

let districtGeoJSON;

// Set the startDate, which will be used to calculate other date offsets
const startDate = new Date("01/01/2013");
// Initialize start/end range for timeline dates
// startRange will initially be the same as startDate
// endRange will update as soon as we've loaded the dataset and determined the latest date
let startRange = utils.addMonths(startDate, 0);
let endRange = utils.addMonths(startDate, 1);

// Declare tile visualization elements
let tileChart;
let sunburst;
let timeline;

// Declare interval for timeline
let interval;

// Initialize opacity level for hidden annotation slides (this will be overriden to 0 if the slides are fixed at the top on mobile)
let hiddenOpacity = 0.2;

// Declare indices to be used by scroll controller
let activeIndex;
let lastIndex;

// Declare maxDateOffset (months) to be determined by last investigation date on dataset when it is loaded
let maxDateOffset;

// Tilechart still in "initialization mode" to prevent events from triggering on fast that shouldn't until it's rendered for the first time
let initTileChart = true;
// Sunburst has not entered yet, meaning on mobile it will grow from center on entrance
let sunburstEntered = false;

// Initial scroll direction is set to down since the user can only move in one direction
// (this will override almost immediately anyway)
let scrollDirection = 'down';

// Declare scrollerDiv, which will designate which set of divs are used to track scroll steps ('.step' on Desktop, '.mobile-spacer' on Mobile)
// And scrollerDivObjects, an array of all divs of this type, used for setting dynamic heights for tile wrappers
let scrollerDiv;
let scrollerDivObjects;
// Declare scroll object, which dispatch scroll trigger events (using code in scroller.js)
let scroll;
// Initialize an array of activate functions which will activate on scroll for corresponding annotation slides
let activateFunctions = [];

// Min width that browser window must be before switching to phoneBrowsing mode (even on Desktop, it will display everything as if on Mobile)
const phoneBrowsingCutoff = 1100;

// Set color scale for outcome cateogries, to be used in sunburst, tilechart, and in text of some annotation slides
const outcomeColors = d3.scaleOrdinal()
    .domain(["Sustained Finding", "No Sustained Findings", "Investigation Pending", "Guilty Finding", "Training/Counseling", "No Guilty Findings", "Discipline Pending"])
    .range(['#658dc6', '#f5ba84', '#8dc665', "#5bb6d2", "rgba(91,182,210,.6)", "rgba(91,182,210,.5)", "rgba(91,182,210,.4)"]);

// ======== END GLOBALS ======== //

// Determine whether to enter phoneBrowsing mode based on browser window width or browser type (uses phoneBrowsingCutoff as threshold of window width)
// Then, execute a lot of code/formatting that depends on whether the user is on Mobile or Desktop
function determinePhoneBrowsing() {
    // On mobile, fade non-current annotation slides to 0, because they are all fixed at the top and overlapping
    // On desktop keep them visible, but low opacity
    if (phoneBrowsing === true) {
        // hiddenOpacity = 0.0;
        hiddenOpacity = 0.2;
    }
    else {
        hiddenOpacity = 0.2;
    }

    // If mobile, and annotations are up top, adjust top-padding on viz-tiles to make room for fixed-position annotation
    // if (phoneBrowsing === true) {
    //     setDynamicPadding('#sample-complaint-tile', 1, 2);
    //     setDynamicPadding('#sunburst-tile', 2, 9);
    //     setDynamicPadding('#tilechart-tile', 9, 17);
    // }
}


// Highlighted annotation text is explicitly set here
// This dictionary is used for any of the highlighted text annotations to determine what to display in the tooltip
const textAnnotations = {
    'analysis': 'Random Forest classifiers were used to look at both investigative and disciplinary outcomes. Features included ' +
    'complainant and officer demographic information, police district demographics, prior known complaints against an officer (using assigned IDs),' +
    'time of year, and complaint type.',
    'sustained': 'An Internal Affairs investigation determined that one or more of the allegations filed in the complaint were ' +
    'supported (or other violations were discovered during the course of the investigation).',
    'investigation': 'Note that a single complaint can result in one or many disciplinary investigations against one or many officers.',
    'highlighted term': 'Even this one!',

    'sustained finding': "An Internal Affairs investigation determined that one or more of the allegations filed in the complaint were " +
    "supported (or other violations were discovered during the course of the investigation). These are then sent to the " +
    "Police Board of Inquiry for a hearing and possible discipline.",
    'sustained findings': "PPD's Internal Affairs investigation determined that one or more of the allegations filed in the complaint were " +
    "supported (or other violations were discovered during the course of the investigation). These are then sent to the " +
    "Police Board of Inquiry for a hearing and possible discipline.",
    'investigation pending': "This indicates a PPD Interval Affairs investigation that is still in progress. " +
    "Sometimes investigations stay here for much longer than the mandated completion time of 75 days.",
    "no sustained findings": "PPD's Internal Affairs investigation determined that 'allegations could not be proven, allegations that did not occur" +
    " or that actions that occurred, but were correct, lawful and complied with departmental policies'.",

    'guilty finding': "On recommendation from the Police Board of Inquiry hearing, the Police Commissioner (or a delegate)" +
    " deems an officer's action worthy of discipline. Investigations classified in PPD's published data with a " +
    "'Guilty Finding' include suspensions, terminations, criminal prosecutions, and reprimands. The data provided by the " +
    "department makes no distinction.",
    'guilty findings': "On recommendation from the Police Board of Inquiry hearing, the Police Commissioner (or a delegate)" +
    " deems an officer's action worthy of discipline. Investigations classified in PPD's published data with a " +
    "'Guilty Finding' include suspensions, terminations, criminal prosecutions, and reprimands. The data provided by the " +
    "department makes no distinction.",
    'no guilty findings': "An investigation is referred from Internal Affairs after allegations are determined to be " +
    "supported by evidence. However, the Police Commissioner (or a delegate) determines that the officer is Not Guilty " +
    "after a Police Board of Inquiry hearing and recommendation.",
    'discipline pending': "An investigation from Internal Affairs has determined that one or more allegations are sustained, " +
    "but a disciplinary decision has not been made yet.",
    'training/counseling': "On recommendation from the Police Board of Inquiry hearing, the Police Commissioner (or a delegate)" +
    " deems an officer's action worthy of discipline, but opts for unspecified 'training/counseling' in lieu of suspension," +
    " termination, or criminal prosectution.",

    'white': "Classified by PPD as 'white'",
    'black': "Classified by PPD as 'black'",
    'latinx': "Classified by PPD as 'latino'",
    'other': "Includes less frequent race/ethnicity classification by PPD, as well as cases with multiple complainants" +
    " of different races/ethnicities",

    'last public update': "The city only publishes data for complaints filed within the past five years. For cases more than " +
    "five years old, no further updates are publicly available through the data portal. This means that technically, in 2020, " +
    "we don't necessarily know the latest details of a pending investigation from 2014, but we do know that it remained pending " +
    "for at least five years.",

    "civilian oversight board": "While Philadelphia technically has a civilian police oversight board, the Police Advisory Commission, " +
    "it is underpowered and underfunded. While they may provide assistance to complainants thoughtout the process, they hold " +
    "no decision-making power in the investigation or discipline of officers. A ballot measure to establish a new Citizen Police " +
    "Oversight Commission is on the ballot in November."
};

// jQuery to move div and create pop-up tooltip with annotation
function setAnnotationTooltips() {
    $('.annotated-text')
    // .on("mouseover", function() {
        .on("mousemove hover touch", function () {

            // This will be used for both the sample investigation and other annotation tooltips
            // Determine which tooltip to trigger based on ID of highlighted text
            let tooltipSelect;
            if ($(this).attr("id") === 'sample-investigation') {
                tooltipSelect = $("#sample-tooltip");
            }
            else {
                tooltipSelect = $("#annotation-tooltip");

                tooltipSelect
                    .text(textAnnotations[$(this).text().toLowerCase()]);
            }

            // If the tooltip would end up off the page to the left, adjust the positioning to the right by the amount it flows over
            let xOffset = event.pageX - tooltipSelect.width() / 2;
            if (xOffset < 0) {
                xOffset += -1 * xOffset;
            }

            // If the tooltip would end up off the screen to the top, adjust the positioning down by the amount it flows over
            let yOffset = event.pageY - tooltipSelect.height() - 35;
            if (event.clientY < tooltipSelect.height() + 35) {
                yOffset = event.pageY + 15;
            }

            // Make the (dormant/hidden, but already existant) tooltip div visible, up-top of other elements and position it
            // according to the offsets determined above
            tooltipSelect
                .css({top: yOffset, left: xOffset})
                .css("opacity", 1.0)
                .css("z-index", 101);
        });

    // If hover available (desktop), remove highlighted text annotation on mouseout otherwise (mobile) do it on scroll
    if (phoneBrowsing === false) {
        $('.annotated-text')
            .on("mouseout", function () {
                let tooltipSelect = $(this).attr("id") === 'sample-investigation' ?
                    $("#sample-tooltip") :
                    $("#annotation-tooltip");

                tooltipSelect
                    .css("opacity", 0.0)
                    .css("z-index", -1);
            });
    }
    else {
    }
}

// Apply necessary trnsformations to the data loaded in the dataset
// A lot of this data was prepared for analysis (and should stay that way), but needs to be in a different form for the visualizations
function preprocessDataset(dataset) {
    dataset.forEach(function(d) {
        // Turn text dates into JS Date objects
        d.date_received = new Date(d.date_received);

        // Set blank demographic fields to 'unknown'
        if (!d.complainant_race) {
            d.complainant_race = 'unknown';
        }
        if (!d.complainant_sex) {
            d.complainant_sex = 'unknown';
        }

        // This allows us to distinguish between two different 'pending' states as we set end states
        if (d.investigative_findings === "Pending") {
            d.investigative_findings = "Investigation Pending";
        }

        if (d.disciplinary_findings === "Pending") {
            d.disciplinary_findings = "Discipline Pending";
        }

        // Determine where the investigation is as of last update and set this as the 'end_state'
        if (d.disciplinary_findings === "Not Applicable" || d.investigative_findings === "Investigation Pending") {
            d.end_state = d.investigative_findings;
        }
        else {
            d.end_state = d.disciplinary_findings;
        }

        if(d.incident_time) {
            d.incident_time = d3.timeParse("%Y-%m-%d %H:%M:%S")(d.incident_time);
        }

        // Set district income groups/classifications based on thresholds.
        // These are somewhat arbitrary, but were basically determined by splitting the districts into three groups.
        if (d.district_income < 35000) {
            d.district_income_group = 'lower';
        }
        else if (d.district_income < 55000) {
            d.district_income_group = 'middle';
        }
        else if (d.district_income >= 55000) {
            d.district_income_group = 'higher';
        }
        else {
            d.district_income_group = null;
        }

        // Set grouping/classifications of prior complaints to turn it into a categorical field
        if (+d.officer_prior_complaints > 1) {
            d.prior_complaints_group = 'multiple';
        }
        else if (+d.officer_prior_complaints === 1) {
            d.prior_complaints_group = 'one';
        }
        else {
            d.prior_complaints_group = 'none';
        }

        if (d.allegations_investigated === "Referred to Other Agency/C.A.P. Investigation") {
            d.allegations_investigated = "Referred to Other Agency";
        }

        // Used for matching the syntax of the 'no_group' group by in the tilechart visualization
        d.no_group = 'default';
    });

    return dataset;
}

// Initialize timeline slider
function initSlider(maxDate) {

    $("#slider-div").slider({
        max: maxDate,
        min: 0,
        step: 1,
        range: true,
        values: [0, 1],
        slide: function(event, ui) {

            // Do not allow the right slider to overlap with the left slider
            if ( ( ui.values[0] + 1 ) >= ui.values[1] ) {
                return false;
            }

            startRange = utils.addMonths(startDate, ui.values[0]);
            endRange = utils.addMonths(startDate, ui.values[1]);

            updateTilechartDates();
        }
    })

    let startSliderValue = utils.monthDiff(startDate, startRange);
    let endSliderValue = utils.monthDiff(startDate, endRange);
    //
    $("#slider-div")
        .slider("values", 0, 0)
        .slider("values", 1, endSliderValue);

}

// Initialize timeline play button
function setPlayButton() {
    $("#play-button")
        .on("tap click", function () {
            let button = $(this);

            if (button.text() == "▶") {
                button.text("❙❙");
                interval = setInterval(step, 1300);
            }
            else {
                button.text("▶");
                clearInterval(interval);
            }

        });
}

// Down arrow scroll trigger
function setScrollArrow() {
    $(".downArrow").on("click", function() {
        // If mobile, arrow will be with them the whole time
        if (phoneBrowsing === true) {

            // If first scroll from intro block
            if ($(window).scrollTop() < window.innerHeight) {
                $('html, body').animate({scrollTop: $('#sample-complaint-wrapper').offset().top }, 'slow');
            }
            // If at joint between sunburst/tilechart, be specific
            else if ($("#last-sunburst-annotation").css("opacity") === "1") {
                $('html, body').animate({scrollTop: $('#tilechart-wrapper').offset().top }, 'slow');
            }
            // If at joint between tilechart and conclusion, be specific
            else if ($("#last-tilechart-annotation").css("opacity") === "1") {
                $('html, body').animate({scrollTop: $('#end-text-block').offset().top - 100 }, 'slow');
            }
            else {
                $('html, body').animate({scrollTop: `+=${$(".mobile-spacer").css("height")}`}, 'fast');
            }

            scrollSpeed = 'fast';
        }

        // If on Desktop, arrow stays at the top and only needs this one trigger
        else {
            $('html, body').animate({scrollTop: $('#first-annotation').offset().top - 100 }, 'slow');
        }
    });

    // If on mobile, the down arrow is fixed at the bottom of the screen and can be used to move from section to section the whole time
    // It should also be a little larger and re-centered
    if (phoneBrowsing === true) {
        $(".downArrow img")
            .attr("width", "70px")
            .attr("height", "70px");

        $(".downArrow")
            .css("text-align", "center")
            .css("position", "fixed")
            .css("left", `calc(50% - 35px)`);
    }
}

// Window re-size/scroll functions
function setWindowFunctions() {
    $(window)
        .resize(function () {
            // Resize timeline on window size/jquery ui slider size change
            if (timeline) {
                timeline.updateDimensions();
            }

            // If window is re-sized to above/below mobile cutoff, refresh the page
            if ((phoneBrowsing === true && window.innerWidth > phoneBrowsingCutoff)
                || (phoneBrowsing === false && window.innerWidth < phoneBrowsingCutoff)) {

                this.location.reload(false);
            }

        })
        // Hide the scroll arrow if the user passes a certain scroll height (past the top of the sunburst on Desktop,
        // a little before the end text on mobile)
        .scroll(function () {
            let arrowFadeHeight = (phoneBrowsing === true) ?
                $('#end-text-block').offset().top - 110 :
                $('#sunburst-wrapper').offset().top;

            if ($(window).scrollTop() > arrowFadeHeight) {
                $(".downArrow")
                    .css("opacity", 0.0);
                // .fadeTo( "fast" , 0);
            }
            else {
                $(".downArrow")
                    .css("opacity", 1.0);
                // .fadeTo( "fast" , 1);
            }
        });
}

// This is the function that runs on an interval if the user presses play on the tilechart
function step() {
    // The new end date is either one month past the current end date (with addMonths())
    // or resets to one month past the start date if the user has hit the max end date
    endRange = utils.monthDiff(startDate, endRange) >= maxDateOffset ? utils.addMonths(startRange, 1) : utils.addMonths(endRange, 1);

    let sliderValue = utils.monthDiff(startDate, endRange);

    console.log("here");
    $("#slider-div")
        .slider("values", 1, sliderValue);

    // Update the text valeus and re-render the tilechart visualiztion (see below)
    updateTilechartDates();

    // If the user is at the max end date, pause the interval function for them. It'll loop back around if they hit play again
    if (utils.monthDiff(startDate, endRange) === maxDateOffset) {
        $("#play-button")
            .text("▶");
        clearInterval(interval);
    };

}

// Forces a reset on d3-tips, as things can get a little murky when the highlightTile() function starts messing with defaults
function resetTilechartTooltips() {
    // Clear any existing d3-tip divs
    d3.selectAll(".d3-tip").remove();
    // Call the function on the tilechart svg again to add a new (default hidden) d3-tip div
    tileChart.svg.call(tileChart.tip);
}


// This will run if a user loads/reloads in the middle of the screen. It will run all activate functions that
// should have run by the given Y Position
function catchupPagePosition(startYPosition) {
    // $(".step").toArray().forEach( function(step, i) {
    //
    //     const topMargin = parseInt($(step).css("margin-top"));
    //
    //     // Run every activate function that should have run by this point on the page
    //     if (startYPosition + topMargin > $(step).offset().top) {
    //         // console.log(i);
    //         activateFunctions[i]();
    //     }
    // });
}


// Update the start/end dates of the tilechart and re-render the visual
function updateTilechartDates() {
    // Update the texst dates
    $("#start-date-display")
        .text(d3.timeFormat("%b '%y")(startRange));

    $("#end-date-display")
        .text( d3.timeFormat("%b '%y")(endRange));

    // Update the slider
    let startSliderValue = utils.monthDiff(startDate, startRange);
    let endSliderValue = utils.monthDiff(startDate, endRange);

    console.log(startSliderValue,endSliderValue);

    $("#slider-div")
        .slider("values", 0, startSliderValue)
        .slider("values", 1, endSliderValue);

    // Re-render the tilechart
    tileChart.wrangleData();
}

// Used to simulate a mousehover (tap on mobile) over a section of the sunburst
function artificialHover(outcomeName) {
    $("#sunburst-area path").removeAttr('style');

    // Find the element corresponding with the outcomeName parameter
    const guiltyFindingElement = $(`path#${outcomeName.replace(/ /g, "-")}`)[0];
    // Find the number of investigations that resulted in this outcome
    const guiltyValue = guiltyFindingElement.getAttribute("value");
    // Pass these values through to the sunburst's mouseover function, which can use them to simulate a mouseover
    sunburst.mouseover(guiltyValue, guiltyFindingElement);
}

// Set the dropdown options above the sunburst
// Takes as an input an array of key-value pairs
function setSelectOptions(optionPairs) {
    optionPairs.forEach(function(pair) {
        let selectID = pair[0];
        let optionVal = pair[1];

        $(`select#${selectID}`)
            .val(optionVal)
            .attr("class", `sunburst-select ${$(`select#${selectID}`).val()}`);
    });

    // Re-render the sunburst with the new filters (the sunburst code will look for these dropdown select values on its own)
    sunburst.wrangleData();
}


// Activate function: triggers on first (phantom) annotation slide at the top of the page
function displayIntroText() {
    // If on Desktop, trigger the sunburst entrance here. On Mobile, it'll trigger when the user scrolls into that tile.
    // if (phoneBrowsing === false && sunburstEntered === false) {
    if (sunburstEntered === false) {
        sunburst = new sunburstCreator.Sunburst("#sunburst-area");
        sunburstEntered = true;
        // disableSunburstUserControl();
    }

    // Reset highlighting on complaint
    $("#sample-tooltip .detail-title, #sample-tooltip .outcome")
        .css("background", "none")
        .css("font-weight", "unset")
        .css("background-color", "rgba(28, 148, 196, 0.0)");
}


// Activate function: triggers on annotation "Philadelphia Police Complaint Data"
function showComplaint() {

    // Reset highlighting on complaint
    $("#sample-tooltip .detail-title")
        .css("background", "none")
        .css("background-color", "rgba(28, 148, 196, 0.0)");

    // $("#sample-tooltip .detail-title")
    //     .css("background", "none");

}


// Activate function: triggers on annotation "Philadelphia Police Complaint Data"
function highlightComplaintDetails() {
    // $("#sample-tooltip .detail-title")
    // $("#sample-tooltip .detail-title:not(.persistent)")
    //     .css("background-color", "rgba(28, 148, 196, 0)");

    $("#sample-tooltip .persistent").markerAnimation({
            "color":'#fe9',
            'padding_bottom':'.1em',
            "thickness":'1.2em',
            "duration":'1s',
            "font_weight":'normal',
            "function":'ease',
            "repeat": false
        })


    // Reset highlighting on complaint outcome
    $("#sample-tooltip .outcome")
        .css("background", "none")
        .css("background-color", "rgba(28, 148, 196, 0.0)");

}


function highlightComplaintOutcome() {

    // $("#sunburst-tile")
    //     .css("opacity", 0.2);

     // Reset fill opacity on all paths to default (0.6)
    // $("#sunburst-area path")
    //     .css("fill-opacity", 0.6);


    $("#sample-tooltip .outcome").markerAnimation({
            "color": 'rgba(242,142,44,0.6)',
            'padding_bottom':'.1em',
            "thickness":'1.2em',
            "font_weight":'normal',
            "duration":'1s',
            "function":'ease',
            "repeat": false
        })
}

// Activate function: triggers on annotation "Investigative Outcomes"
function showInvestigationGroups() {
    // If on mobile, the sunburst entrance happens here
    // if (phoneBrowsing === true && sunburstEntered === false) {
    if (sunburstEntered === false) {
        sunburst = new Sunburst("#sunburst-area");
        sunburstEntered = true;
        // Disable user controls over the dropdown selects until the end of the sunburst section
        // disableSunburstUserControl();
    }

    // Clears any artificial or real hover (if active)
    sunburst.mouseout();

    // Fade the sample complaint tile and show the sunburst tile
    // $("#sample-complaint-tile")
    //     .css("opacity", 0.2);
    //
    // $("#sunburst-tile")
    //     .css("opacity", 1.0);


    // Hide all child (disciplinary outcome) sections
    // $("#sunburst-area path.child")
    //     .css("fill-opacity", 0.3);

    // Highlight only the parent (investigative outcome) sections
    // $("#sunburst-area path.parent")
    //     .css("fill-opacity", 0.8);

}


// Activate function: triggers on annotation "Discarded Complaints"
function highlightNotSustained() {

    // If on mobile, the sunburst entrance happens here
    if (phoneBrowsing === true && sunburstEntered === false) {
        sunburst = new Sunburst("#sunburst-area");
        sunburstEntered = true;
        // Disable user controls over the dropdown selects until the end of the sunburst section
        // disableSunburstUserControl();
    }

    // $("#sunburst-static-text")
    //     .clearQueue()
    //     .animate({ 'top': '80px'}, 1000);

    $("#sunburst-select-text")
        .css("visibility", "hidden")
        .css("display", "none");

    $("#sunburst-static-text")
        .css("visibility", "visible")
        .css("display", "block");

    sunburst.displaySecondLevel = false;
    sunburst.wrangleData();

    // Clears any artificial or real hover (if active)
    sunburst.mouseout();

    // Fade the sample complaint tile and show the sunburst tile
    // $("#sample-complaint-tile")
    //     .css("opacity", 0.2);

    // $("#sunburst-tile")
    //     .css("opacity", 1.0);

    // Simulate a hover over the 'sustained finding' section
    artificialHover("Sustained Finding");

    // Hide all outcome groups
    // $("#sunburst-area path")
    //     .css("fill-opacity", 0.3);

    // Highlight only the "not sustained" section
    // $("#sunburst-area path.Sustained-Finding")
    //     .css("fill-opacity", 0.8);

}


// Activate function: triggers on annotation "Sustained Complaints"
function highlightSustained() {
    // $("#sunburst-static-text")
    //     .clearQueue()
    //     .animate({ 'top': '80px'}, 1000)

    sunburst.displaySecondLevel = false;
    sunburst.wrangleData();

    // Simulate a hover over the 'sustained finding' section
    artificialHover("Sustained Finding");

    // Hide all outcome groups
    // $("#sunburst-area path")
    //     .css("fill-opacity", 0.3);
    //
    // Highlight only the "not sustained" section
    // $("#sunburst-area path.Sustained-Finding")
    //     .css("fill-opacity", 0.8);

}


// Activate function: triggers on annotation "Disciplinary Outcomes"
function showDisciplinaryGroups() {
    sunburst.displaySecondLevel = true;

    $("#sunburst-select-text")
        .css("visibility", "visible")
        .css("display", "block");

    $("#sunburst-static-text")
        .css("visibility", "hidden")
        .css("display", "none");


    // Make sure the select options are set to all, in case this has been changed (scroll from below or user has enabled controls)
    setSelectOptions([["sunburst-complainant-race", "all"], ["sunburst-po-race", "all"]]);

    // Simulate a hover over the 'sustained finding' section
    // artificialHover("Sustained Finding");

    // Highlight all child (disciplinary outcome) sections
    // $("#sunburst-area path.child")
    //     .css("fill-opacity", 0.8);

    // Hide all the parent (investigative outcome) sections
    // $("#sunburst-area path.parent")
    //     .css("fill-opacity", 0.3);

    // Hide all the parent (investigative outcome) sections
    // $("#sunburst-area path")
    //     .css("fill-opacity", 0.3);

    // Highlight the 'Sustained Finding' parent section, specifically
    // $("#sunburst-area path.Guilty-Finding")
    //     .css("fill-opacity", 0.8);

    // Simulate a hover over the 'sustained finding' section
    artificialHover("Guilty Finding");

}


// Activate function: triggers on annotation "Guilty Findings"
function highlightGuilty() {
    $("#sunburst-select-text")
        .css("visibility", "hidden");

    $("#sunburst-static-text")
        .css("visibility", "visible");


    // Make sure the select options are set to all, in case this has been changed (scroll from below or user has enabled controls)
    setSelectOptions([["sunburst-complainant-race", "all"], ["sunburst-po-race", "all"]]);
    // Simulate a hover over the 'guilty finding' section
    artificialHover("Guilty Finding");
}


// Activate function: triggers on annotation "White Complainants"
function guiltyWhiteComplainant() {
    $("#sunburst-static-text")
        .css("visibility", "hidden");

    $("#sunburst-select-text")
        .css("visibility", "visible");

    // Set complainant race select to 'White'
    setSelectOptions([["sunburst-complainant-race", "white"], ["sunburst-po-race", "all"]]);
    artificialHover("Guilty Finding");
}


// Activate function: triggers on annotation "Black Complainants"
function guiltyBlackComplainant() {
    // Set complainant race select to 'Black'
    setSelectOptions([["sunburst-complainant-race", "black"], ["sunburst-po-race", "all"]]);
    artificialHover("Guilty Finding");
}


// Activate function: triggers on annotation "Black Complainant/White Officer"
function guiltyBlackComplainantWhiteOfficer() {
    // Since this is the last sunburst annotation, if user enters from below, show the sunburst and fade the tilechart
    if (scrollDirection === 'up') {
        $("#sunburst-tile")
            .css("opacity", 1.0);

        // $("#tilechart-tile")
        //     .css("opacity", 0.2);
    }

    // Set complainant race select to 'Black' and officer race to 'White
    setSelectOptions([["sunburst-complainant-race", "black"], ["sunburst-po-race", "white"]]);
    artificialHover("Guilty Finding");
}


function guiltyWhiteComplainantBlackOfficer() {

    // Double-check that tilechart tooltips are reset after highlight tile on a fast scroll up
    if (scrollDirection === 'up') {
        resetTilechartTooltips();
    }

    // Clear any existing outlined section
    sunburst.removeOutlineSections();

    // Outline the 'guilty finding' and 'sustained finding' sections from the last filter set
    if (scrollDirection === 'down') {
        sunburst.createOutlineSections(['Guilty Finding', 'Sustained Finding']);
    }

    // Set complainant race select to 'White' and officer race to 'Black'
    setSelectOptions([["sunburst-complainant-race", "white"], ["sunburst-po-race", "black"]]);
    artificialHover("Guilty Finding");
}


// Enables control over the select dropdown filters on top of the sunburst
function enableSunburstUserControl() {
    Array.from(document.getElementsByClassName("sunburst-select")).forEach(function(selectElement) {
        selectElement.disabled = false;
    });

    $(".sunburst-select")
        .css('-webkit-appearance', 'menulist-button')
        .css('appearance', 'menulist-button');
}


// Disables control over the select dropdown filters on top of the sunburst
function disableSunburstUserControl() {
    Array.from(document.getElementsByClassName("sunburst-select")).forEach(function(selectElement) {
        selectElement.disabled = true;
    });

    $(".sunburst-select")
        .css('-webkit-appearance', 'none')
        .css('appearance', 'none')
        .css('opacity', 1.0);
}


// Activate function: triggers on annotation "Examine On Your Own"
function enableUserExamine() {
    // Since this is the last sunburst annotation, if user enters from below, show the sunburst and fade the tilechart
    if (scrollDirection === 'up') {
        $("#sunburst-tile")
            .css("opacity", 1.0);

        // $("#tilechart-tile")
        //     .css("opacity", 0.2);
    }

    // Remove outlined sections from above and enable user control over the select dropdown filters
    sunburst.removeOutlineSections();
    enableSunburstUserControl();
}


// Activate function: triggers on annotation "The Full Picture"
function tilechartEntrance() {
    // Since this is the first tilechart section, fade the sunburst tile, show the tilechart
    // $("#sunburst-tile")
    //     .css("opacity", 0.2);

    $("#tilechart-tile")
        .css("opacity", 1.0);

    // Return the highlighted tile from below if the user scrolls up
    if (scrollDirection === 'up' && typeof tileChart.highlightTileX !== "undefined") {
        // resetTilechartTooltips();
        tileChart.returnTile();
    }

}


// Activate function: triggers on annotation "Stories Behind The Complaints"
function highlightTile() {
    // Specific story picked for highlight (function will look for this tile, and if it doesn't find it, trigger a random one)
    const selectedStory = "13-0541-PS-Physical Abuse";

    // Only if coming from the top, clear any existing tooltips and trigger the highlightTile() function
    if (scrollDirection === 'down' && tileChart.tilechartReady === true) {
        resetTilechartTooltips();

        // startRange = startDate;
        // endRange = addMonths(startDate, maxDateOffset);
        // updateTilechartDates();

        tileChart.highlightTile(selectedStory);
    }

    // If scrolling up, reset the 'group by' on the tilechart
    else if (scrollDirection === 'up') {
        if (phoneBrowsing === true) {
            $("#mobile-group-by-select").val("no_group");
        }
        else {
            $("#sort-feature-select").val("no_group").trigger("chosen:updated");
        }
        // tileChart.representedAttribute = 'no_group';
        tileChart.wrangleData();
    }

}


// Activate function: triggers on annotation "Organizing The Data"
function showTilechartByPriorComplaints() {

    // Set the 'Group By' select to 'complainant race' and trigger the update on the chosen.js select
    if (phoneBrowsing === true) {
        $("#mobile-group-by-select").val("prior_complaints_group");
    }
    else {
        $("#sort-feature-select").val("prior_complaints_group").trigger("chosen:updated");
    }

    // If coming from above, reset tooltips and return the highlight tile
    if (scrollDirection === 'down' && typeof tileChart.highlightTileX !== "undefined") {
        resetTilechartTooltips();
        tileChart.returnTile();
    }

    // If coming from below, reset opactity on the investigation pending section and reset the date range
    else if (scrollDirection === 'up') {
        tileChart.returnTileSections();

        if (phoneBrowsing === true) {
            $("#mobile-start-year-select").val("2013");
            $("#mobile-end-year-select").val("2020");

            tileChart.wrangleData();
        }
        else {
            startRange = startDate;
            endRange = utils.addMonths(startDate, maxDateOffset);
            updateTilechartDates();
        }
    }

    if (phoneBrowsing === true) {
        $("#mobile-complaint-type-select").val("All");
        tileChart.wrangleData();
    }
    else {
        $(".chosen-select").chosen().val(tileChart.incidentTypes).trigger("chosen:updated");
        tileChart.selectedComplaintTypes = tileChart.incidentTypes;
        updateTilechartDates();
    }

}


// Activate function: triggers on annotation "Overdue Investigations"
function highlightOverduePending() {

    // If coming from above, reset tooltips again in case of a fast scroll (doesn't seem to be necessary anymore, but just to be safe)
    if (scrollDirection === 'down') {
        resetTilechartTooltips();
    }

    // Reset complaint classifications to all
    if (phoneBrowsing === true) {
        $("#mobile-complaint-type-select").val("All");
    }
    else {
        $(".chosen-select").chosen().val(tileChart.incidentTypes).trigger("chosen:updated");
        tileChart.selectedComplaintTypes = tileChart.incidentTypes;
    }

    // Change date range to only include dates up through the end of 2017
    if (phoneBrowsing === true) {
        $("#mobile-start-year-select").val("2013");
        $("#mobile-end-year-select").val("2017");

        tileChart.wrangleData();
    }
    else {
        startRange = startDate;
        endRange = new Date("Jan 01 2018");

        updateTilechartDates();
    }

    // Highlight the tiles in the 'Investigation Pending' section
    tileChart.highlightTileSection("Investigation Pending");

}


// Activate function: triggers on annotation "Complaint Classifications"
function showComplaintTypes() {

    // If coming from above, reset tooltips again in case of a fast scroll (doesn't seem to be necessary anymore, but just to be safe)
    if (scrollDirection === 'down') {
        resetTilechartTooltips();
    }

    if (phoneBrowsing == true) {
        $("#mobile-complaint-type-select").val("Physical-Abuse");
        $("#mobile-start-year-select").val("2013");
        $("#mobile-end-year-select").val("2020");

        tileChart.wrangleData();
    }
    else {
        // Select specific complaint types to include in multi-select and then trigger the chosen.js select box to update
        // const selectedVals = ['Physical Abuse', 'Criminal Allegation', 'Verbal Abuse', 'Sexual Crime/Misconduct', 'Civil Rights Complaint'];
        const selectedVals = ['Physical Abuse'];
        $(".chosen-select").chosen().val(selectedVals).trigger("chosen:updated");
        tileChart.selectedComplaintTypes = selectedVals;

        // Reset date range to full range
        startRange = startDate;
        endRange = utils.addMonths(startDate, maxDateOffset);

        updateTilechartDates();
    }

}


// Activate function: triggers on final, phantom step, if on mobile
function hideFinalAnnotationSlide() {
    $("section.step").eq(12)
        .css("opacity", hiddenOpacity);
}


// Wrapper function for activate functions
// Changes opacity of annotation text, sets scroll direction and makes sure that all activate functions that should trigger,
// do trigger on a fast scroll (rather than skipping intermediate sections)
function activate(index) {

    activeIndex = index;

    if (lastIndex > activeIndex) {
        scrollDirection = 'up'
    }
    else {
        scrollDirection = 'down';
    }

    // Make sure that all activateFunctions between the activeIndex and the lastIndex run, in case of a fast scroll
    const sign = (activeIndex - lastIndex) < 0 ? -1 : 1;
    const scrolledSections = d3.range(lastIndex + sign, activeIndex + sign, sign);

    activateFunctions[index]();

    // scrolledSections.forEach(function(i) {
    //     if (i-1 >= 0) {
    //         console.log(i);
    //         activateFunctions[i - 1]();
    //     }
    // });

    lastIndex = activeIndex;
};


function setScrollDispatcher() {

    function handleStepEnter(response) {
      activate(response.index);
      scrollDirection = response.direction;

      if (phoneBrowsing === false && vw > 1100) {

          d3.selectAll(".step").style("opacity", (d, i) => {
              if (i === response.index) {
                  return 1;
              }
              else {
                  return .2;
              }
          })
      }
    }


    const scroller = scrollama();

    let tileOffset = .8;
    if (phoneBrowsing === true || vw < 1100) {
        tileOffset = 1.0;
    }

    scroller
  		.setup({
  			// container: '#scroll', // our outermost scrollytelling element
  			// graphic: '.scroll__graphic', // the graphic
  			// text: '.scroll__text', // the step container
  			step: '.step', // the step elements
  			offset: tileOffset, // set the trigger to be 1/2 way down screen
  			// debug: true, // display the trigger offset for testing
  		})
  		.onStepEnter(handleStepEnter);
  		// .onContainerEnter(handleContainerEnter)
  		// .onContainerExit(handleContainerExit);

    setActivateFunctions();
}


function setDynamicPadding(tileID, startIndex, endIndex) {
    let maxAnnotationHeight = 150;
    $(".step").toArray().slice(startIndex, endIndex+1).forEach(function (annotationBox) {
        const boxHeight = annotationBox.getBoundingClientRect().height;
        if (boxHeight > maxAnnotationHeight) {
            maxAnnotationHeight = boxHeight;
        }
    });

    $(".step").toArray().slice(startIndex, endIndex+1).forEach(function (annotationBox) {
        $(annotationBox)
            .css("min-height", 0.7*maxAnnotationHeight);
    });

    $(tileID)
        .css("padding-top", maxAnnotationHeight);
}


// Populate activateFunctions array with functions that will trigger on corresponding annotation slides
function setActivateFunctions() {
    scrollerDivObjects = $(scrollerDiv);

    // Intro tile functions
    //activateFunctions[0] = displayIntroText;

    // Sample complaint tile functions
    activateFunctions[0] = highlightComplaintDetails;
    activateFunctions[1] = highlightComplaintOutcome;

    // Sunburst tile functions
    activateFunctions[2] = highlightNotSustained;
    activateFunctions[3] = showDisciplinaryGroups;
    activateFunctions[4] = guiltyWhiteComplainant;
    activateFunctions[5] = guiltyBlackComplainant;
    activateFunctions[6] = guiltyBlackComplainantWhiteOfficer;
    // Matrix will go here

    // Tilechart tile functions
    activateFunctions[7] = tilechartEntrance;
    activateFunctions[8] = highlightTile;
    activateFunctions[9] = showTilechartByPriorComplaints;
    // activateFunctions[11] = highlightOverduePending;
    activateFunctions[10] = showComplaintTypes;

    // End text functions
    activateFunctions[11] = hideFinalAnnotationSlide();
}


// Use the boundingRects of annotation tiles that correspond with a given tile to determine the height of the wrapper div
// Actual visualization tiles are set with position: sticky, so the height of the surrounding wrapper div will determine when they stop moving with the scroll
function setTileWrapperHeights() {
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)

    let sampleComplaintHeight = null;
    if (phoneBrowsing === true) {
        sampleComplaintHeight = scrollerDivObjects[3].getBoundingClientRect().bottom - scrollerDivObjects[1].getBoundingClientRect().top - 0.5*vh;
    }
    else {
        sampleComplaintHeight = scrollerDivObjects[3].getBoundingClientRect().bottom - scrollerDivObjects[1].getBoundingClientRect().top - 430;
    }
    $("#sample-complaint-wrapper")
        .css("height", sampleComplaintHeight);

    // Sunburst annotations run from the second annotation div (first visible) to the ninth (top of ten)
    // There's a little extra finagling at the end to get the margin between the two viz wrappers correct
    let sunburstWrapperHeight = null;
    if (phoneBrowsing === true) {
        sunburstWrapperHeight = scrollerDivObjects[8].getBoundingClientRect().bottom - scrollerDivObjects[3].getBoundingClientRect().top;
    }
    else {
        sunburstWrapperHeight = scrollerDivObjects[8].getBoundingClientRect().bottom - scrollerDivObjects[3].getBoundingClientRect().top - 310;
    }
    $("#sunburst-wrapper")
        .css("height", sunburstWrapperHeight);

    // Tilechart annotation divs run from the tenth annotation div to the fourteenth
    let tileChartWrapperHeight = null;
    if (phoneBrowsing === true) {
        tileChartWrapperHeight = scrollerDivObjects[scrollerDivObjects.length - 1].getBoundingClientRect().bottom - scrollerDivObjects[8].getBoundingClientRect().top + 1300;
    }
    else {
        tileChartWrapperHeight = scrollerDivObjects[scrollerDivObjects.length - 1].getBoundingClientRect().top - scrollerDivObjects[8].getBoundingClientRect().top + 700;
    }
    $("#tilechart-wrapper")
        .css("height", tileChartWrapperHeight);
}


function init() {

    // Begin loading datafiles
    let promises = [
        d3.csv("assets/data/complaint_discipline_viz_data.csv")
    ];

    // Load as a separate promise so that all non-tilechart tooltip elements can run, even if the summaries take longer to load
    let summaryPromise = [
        d3.json("assets/data/complaint_discipline_summary_data.json")
    ];

    determinePhoneBrowsing();
    setAnnotationTooltips();
    setWindowFunctions();

    Promise.all(promises).then((allData) => {

        officerDisciplineResults = allData[0];

        $(".loadring-container")
            .hide();

        $("#intro-wrapper")
            .css("visibility", "visible");

        const datasetDateRange = d3.extent(officerDisciplineResults, function(d) {
            return new Date(d.date_received);
        });

        maxDateOffset = utils.monthDiff(datasetDateRange[0], datasetDateRange[1]);


        officerDisciplineResults = preprocessDataset(officerDisciplineResults);
        officerDisciplineResults = officerDisciplineResults.filter(function(d) {
             return d.investigative_findings !== "Not Applicable" && !(d.investigative_findings === "Sustained Finding" && d.disciplinary_findings === "Not Applicable");
        });
        endRange = utils.addMonths(startDate, maxDateOffset);
        initSlider(maxDateOffset);

        tileChart = new tileChartCreator.TileChart("#chart-area");



        if (phoneBrowsing === false) {
            timeline = new timelineCreator.Timeline("#slider-div");
        }

        $(".select")
            .chosen()
            .on('change', () => {
                tileChart.wrangleData();
            });

        $("#mobile-start-year-select, #mobile-end-year-select, #mobile-complaint-type-select, #mobile-group-by-select")
            .on('change', () => {
                tileChart.wrangleData();
            });


        $("#mobile-start-year-select, #mobile-end-year-select")
            .on('change', () => {
                const startYear = $("#mobile-start-year-select").children("option:selected").val();
                const endYear = $("#mobile-end-year-select").children("option:selected").val();

                $("#mobile-end-year-select option, #mobile-start-year-select option")
                    .removeAttr("disabled");

                for (let i=2013; i < startYear; i++) {
                    $(`#mobile-end-year-select option[value="${i}"]`)
                        .attr("disabled", "disabled")
                }

                for (let i=(parseInt(endYear) + 1); i <= 2020; i++) {
                    $(`#mobile-start-year-select option[value="${i}"]`)
                        .attr("disabled", "disabled")
                }
            });

        displayIntroText();

        if(timeline) {
          timeline.updateDimensions();
        }

        // If user loads visualization in the middle of the page, run all activate functions that they should have passed
        // already to "catch them up"
        const startingOffset = window.pageYOffset;
        if (startingOffset > 5) {
            catchupPagePosition(startingOffset)
        }

        setScrollDispatcher();


        // window.addEventListener('scroll', function(e) {
        //
        //   if(d3.select(".d3-tip").style("opacity") == 1){
        //     d3.select(".d3-tip").style("opacity",0);
        //   }
        // });


    });

    Promise.all(summaryPromise).then((allData) => {
        complaintSummaries = allData[0];
    })
}

function getOfficerDisciplineResults() {
  return officerDisciplineResults
}

function getStartRange() {
  return startRange;
}

function getStartDate() {
  return startDate;
}

function getComplaintSummaries() {
  return complaintSummaries;
}

function getEndRange() {
  return endRange;
}

function getInitTileChart() {
  return initTileChart;
}

function getMaxDateOffset() {
  return maxDateOffset;
}

function getOutcomeColors(){
  return outcomeColors;
}

function getSunburst(){
  return sunburst;
}

function getActiveIndex(){
  return activeIndex;
}

function getTileChart(){
  return tileChart;
}

export default { init, resize, getComplaintSummaries,getTileChart,getSunburst,getActiveIndex, getStartDate,getMaxDateOffset, getOutcomeColors, getStartRange, getEndRange, getInitTileChart, getOfficerDisciplineResults };
