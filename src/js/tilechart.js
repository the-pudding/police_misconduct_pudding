//import { startRange, endRange, initTileChart } from "./graphic.js"
import utils from './utils';
import $ from 'jquery';
window.$ = window.jQuery = $;
import chosen from 'chosen-js';
import d3Tip from "d3-tip"
//import { officerDisciplineResults } from "./graphic"
import graphic from "./graphic.js"
import isMobile from "./utils/is-mobile";

let officerDisciplineResults = null;
let startRange = null;
let startDate = null;
let endRange = null;
let initTileChart = null;
let maxDateOffset = null;
let outcomeColors = null;
let activeIndex = null;
let complaintSummaries = null;
let tileChart = null;

let tooltipVisible = false;
let stickyTooltip = false;



const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);


let phoneBrowsing = (isMobile.any() == null) ? false : true;
if(vw < 1100) {
  phoneBrowsing = true;
}


let TileChart = function(_parentElement) {
    this.parentElement = _parentElement;

    this.initVis();
};


TileChart.prototype.initVis = function() {
    const vis = this;

    startRange = graphic.getStartRange();
    endRange = graphic.getEndRange();
    maxDateOffset = graphic.getMaxDateOffset();

    // Establish margins
    vis.margin = {top: 90, right: 15, bottom: 45, left: 40};

    vis.svg = d3.select(vis.parentElement)
        .append("svg");

    vis.height = 800;
    vis.width = 1050;

    if (phoneBrowsing === true) {
        vis.height = vh*0.85;
        vis.width = vw;

        vis.margin.top = 0;
        vis.margin.left = 0;
    }

    // Make svg size flexible based on window dimensions
    vis.svg
        //.attr("preserveAspectRatio", "xMaxYMax meet")
        .attr("viewBox", `0 0 ${vis.width} ${vis.height*.75}`);


    vis.g = vis.svg.append("g")
        .attr("class", vis.parentGroupClass)
        .attr("id", "chart-data")
        .attr("transform",
              "translate(" + vis.margin.left + "," + vis.margin.top + ")");

    // Set the x-coordinate of the three outcome tile columns
    vis.col1x = 25;
    vis.col2x = 200;
    vis.col3x = 725;

    // Set the y-coordinate of the first row of outcome blocks
    vis.row1y = -35;

    // blockSpacing is the number of pixels between tiles, trueBlockWidth is the full width of a tile (blockWidth + blockSpacing)
    // (Replacing with colored border on tile)
    vis.blockSpacing = 0;

    // Make adjustments for different screen heights, so that the visualization doesn't get cut off at the bottom
    // blockSize sets the width/height of each tile, blockGroupWidth sets the number of tiles in a block group row
    // (though this actual value may vary based on a scalar)
    if (phoneBrowsing === true) {
        vis.blockSize = 10;
        vis.blockGroupWidth = 94;
        vis.blockSpacing = 0;

        // Shift all tile columns over a little on mobile for better centering
        vis.col1x += 25;
        vis.col2x += 25;
        vis.col3x += 25;

        vis.rowHeightAdjustment = 0;
        vis.rowHeightAdjustment = 0;
    }
    else if (window.innerHeight > 950) {
        vis.blockSize = 6;
        vis.blockGroupWidth = 40;

        vis.rowHeightAdjustment = 0;
    }
    else {
         vis.blockSize = 5;
         vis.blockGroupWidth = 43;

         vis.col2x += 25;

         // If the window height is under 950 and this is on Desktop, we'll avoid the 'Sustained Finding' box getting cutoff on the bottom by
         // Shifting the bottom two rows up and shifting the bottom of the outline box up by 30 pixels
         vis.rowHeightAdjustment = -30;
    }

    // Initiliaze this boolean, which will be used to clear a pinned highlight tile tooltip later if set
    vis.pinnedTooltip = false;

    vis.trueBlockWidth = (vis.blockSize + vis.blockSpacing);

    // fullBlockWidth is the width, in pixels, of the group of tiles (the true width of each block multiplied by the number of blocks in a row)
    vis.fullBlockWidth = vis.blockGroupWidth*vis.trueBlockWidth;

    // This determines how much a highlight tile will grow when called out
    vis.highlightRectScalar = 10;

    // Default 'group by' attribute (none)
    vis.representedAttribute = 'no_group';

    // Sets the values to be used in the color scale for each 'group by' option.
    // This will be referenced later to determine the domain for the color scale used by the tiles in their 'fill' callback function
    vis.representedVals = {
        'no_group': ["default"],
        'complainant_race': ["black", "white", "latino"],
        'po_race': ["black", "white", "latino"],
        'district_income_group': ['higher', 'middle', 'lower'],
        'po_sex': ['male', 'female'],
        'complainant_sex': ['male', 'female'],
        'prior_complaints_group': ['none', 'one', 'multiple']
    };

    // Set the output for the color scale and default/unknown to 'gray'. Domain will be determined based on 'group by' value
    vis.color = d3.scaleOrdinal()
        .range(["#3232FF", "#FF1919", "#FFAC14"])
        .unknown("gray");

    // Set the display text above the timeline to reflect current slider values
    vis.startDateText = d3.select("#start-date-display").append("text")
        .attr("class", "date-display")
        .attr("x", 0)
        .attr("y", 30)
        .attr("text-anchor", "start")
        .text(d3.timeFormat("%b '%y")(startRange))
    vis.endDateText = d3.select("#end-date-display").append("text")
        .attr("class", "date-display")
        .attr("x", 0)
        .attr("y", 30)
        .attr("text-anchor", "start")
        .text(d3.timeFormat("%b '%y")(endRange))


    // Set the coordinates for each outcome group, used by the tiles to find the correct position (these coordinates, plus some offset depending on the tile index)
    // Note that the rowHeightAdjustment is applied to the lower groups in the 'Sustained Finding' group to move them up if there's a smaller window height
    // In most cases, the value of rowHeightAdjustment will be zero, so this adjustment has no impact
    vis.outcomeCoordinates = {
        "Investigation Pending": [vis.col1x, vis.row1y],

        "No Sustained Findings": [vis.col2x, vis.row1y],

        "Sustained Finding": [vis.col3x, vis.row1y],
        "Guilty Finding": [vis.col3x, vis.row1y + 55],
        "Training/Counseling": [vis.col3x, vis.row1y + 175 + vis.rowHeightAdjustment],
        "No Guilty Findings": [vis.col3x, vis.row1y + 395 + 2*vis.rowHeightAdjustment],
        "Discipline Pending": [vis.col3x, vis.row1y + 475 + 2*vis.rowHeightAdjustment]
    };

    // Set the true widths of each outcome tile group. These are all based on the blockGroupWidth established above, but are given a scalar to account
    // for the very imbalanced size of these groups so that things can fit neatly on the screen
    // (e.g. the width of 'No Sustained Findings' must be made wider so that the group fits within the window height and some of that screen real-estate
    // can be borrowed from the 'Investigation Pending' group which is made narrower because it has very few tiles)
    vis.colWidths = {
        "Investigation Pending": Math.round(0.6*vis.blockGroupWidth),

        "No Sustained Findings": Math.round(2.0*vis.blockGroupWidth),

        "Sustained Finding": Math.round(vis.blockGroupWidth),
        "Guilty Finding": Math.round(vis.blockGroupWidth),
        "Training/Counseling": Math.round(vis.blockGroupWidth),
        "No Guilty Findings": Math.round(vis.blockGroupWidth),
        "Discipline Pending": Math.round(vis.blockGroupWidth)
    };

    if (phoneBrowsing === true) {

        officerDisciplineResults = graphic.getOfficerDisciplineResults();

        const staticCounts = {
            "No Sustained Findings": officerDisciplineResults.slice().filter(d => d.investigative_findings === "No Sustained Findings").length,
            "Sustained Finding": officerDisciplineResults.slice().filter(d => d.disciplinary_findings === "Training/Counseling").length,
            "Investigation Pending": officerDisciplineResults.slice().filter(d => d.investigative_findings === "Investigation Pending").length
        };


        vis.mobileSideMargin = 16;
        vis.mobileTopMargin = 30;

        vis.blockSize = 3.5;
        // vis.blockGroupWidth = 94;
        vis.blockSpacing = 0;
        vis.trueBlockWidth = (vis.blockSize + vis.blockSpacing);

        let availableWidth = vw - 2*vis.mobileSideMargin;
        vis.blockGroupWidth = Math.round(availableWidth/vis.blockSize);

        vis.sustainedFindingColScalar = 0.22;

        // row 1: 0.45*vh
        // row 2: 0.24*vh

        const row1 = vis.mobileTopMargin;
        const row2 = row1 + ((staticCounts["No Sustained Findings"]/vis.blockGroupWidth) * vis.blockSize) + 35;
        const row3 = row2 + ((staticCounts["Sustained Finding"]/(vis.blockGroupWidth*vis.sustainedFindingColScalar)) * vis.blockSize) + 50;

        vis.outcomeCoordinates = {
            "No Sustained Findings": [vis.mobileSideMargin, row1],

            "Sustained Finding": [vis.mobileSideMargin, row2],

            "Guilty Finding": [vis.mobileSideMargin, row2+15],
            "Training/Counseling": [vis.mobileSideMargin+(availableWidth*0.25), row2+15],
            "No Guilty Findings": [vis.mobileSideMargin+(availableWidth*0.5), row2+15],
            "Discipline Pending": [vis.mobileSideMargin+(availableWidth*0.75), row2+15],

            "Investigation Pending": [vis.mobileSideMargin, row3+15],
        };

        vis.colWidths = {
            "Investigation Pending": Math.round(vis.blockGroupWidth),

            "No Sustained Findings": Math.round(vis.blockGroupWidth),

            "Sustained Finding": Math.round(vis.sustainedFindingColScalar*vis.blockGroupWidth),
            "Guilty Finding": Math.round(vis.sustainedFindingColScalar*vis.blockGroupWidth),
            "Training/Counseling": Math.round(vis.sustainedFindingColScalar*vis.blockGroupWidth),
            "No Guilty Findings": Math.round(vis.sustainedFindingColScalar*vis.blockGroupWidth),
            "Discipline Pending": Math.round(vis.sustainedFindingColScalar*vis.blockGroupWidth)
        }
    }


    // Add outcome labels to the top of each tile group
    // On hover, these will display summary statistics for the tiles in the group
    vis.outcomeLabels = vis.g.selectAll("text")
        .data(Object.keys(vis.outcomeCoordinates))
        .enter()
        .append("text")
        .attr("class", function(d) {
            return "group-label " + utils.formatSpacedStrings(d);
        })
        .attr("x", function(d) {
            if (phoneBrowsing === true) {
                return vis.outcomeCoordinates[d][0];
            }
            else {
                return vis.outcomeCoordinates[d][0] + (vis.trueBlockWidth * vis.colWidths[d] / 2);
            }
        })
        .attr("y", function(d) {
            return vis.outcomeCoordinates[d][1] - 14;
        })
        .attr("text-anchor", () => phoneBrowsing === true ? "start" : "middle")
        .style("font-size", function(d) {
            // Adjust font size for mobile to make these headings more visible
            // Top-level labels are larger than the second-level (disciplinary) outcomes
            if (['Investigation Pending', 'No Sustained Findings', 'Sustained Finding'].includes(d)) {
                if (phoneBrowsing === true) {
                    return "14px";
                }
                else {
                    return "12pt";
                }
            }
            else {
                if (phoneBrowsing === true) {
                    return '9px';
                }
                else {
                   return "9pt";
                }
            }
        })
        .on("mousemove", function() {
            const tooltipSelect = $("#category-tooltip");

            // Find/format summary stats for the tile group using the updateCounts() function (below)
            tooltipSelect
                .html(vis.updateCounts($(this).text()));
                // .css('position', 'fixed');

            let xOffset = event.pageX - tooltipSelect.width()/2;
            if (xOffset < 0) {
                xOffset += -1 * xOffset;
            }

            tooltipSelect
                // .css('position', 'fixed')
                .css({top: event.pageY - tooltipSelect.height() - 40, left: xOffset})
                .css("opacity", 1.0)
                .css("z-index", 100);
        })
        .on("mouseout", function() {
            $("#category-tooltip")
                .css("opacity", 0.0)
                .css("z-index", -1);
        })
        .text(d => (phoneBrowsing === true && d === "Training/Counseling") ? "Training" : d);

    // Definte all incident types for initializing the 'Complaint Classification' multi-select
    // vis.incidentTypes = ['Departmental Violations', 'Lack Of Service', 'Physical Abuse',  'Verbal Abuse','Unprofessional Conduct', 'Criminal Allegation', 'Harassment','Civil Rights Complaint','Domestic', 'Falsification', 'Sexual Crime/Misconduct','Drugs']
    vis.incidentTypes = ["Civil Rights Complaint", "Criminal Allegation", "Departmental Violation", "Disciplinary Code Violation", "Domestic", "Drugs", "Falsification", "Harassment", "Investigation OnGoing", "Lack of Service", "Other Misconduct", "Physical Abuse", "Referred to Other Agency", "Sexual Crime/Misconduct", "Unprofessional Conduct", "Verbal Abuse"];

    // Outline all Sustained Finding subgroups to make relationship more clear
    if (phoneBrowsing !== true) {
        vis.svg.append("rect")
            .attr("x", vis.col3x + 25)
            .attr("y", vis.row1y + 85)
            .attr("width", vis.fullBlockWidth * 1.12)
            .attr("height", () => 565 + 2 * vis.rowHeightAdjustment)
            .attr("stroke-width", "1px")
            .attr("stroke", "black")
            .attr("fill", "rgba(255,255,255,0.5)")
            .attr("rx", 10)
            .attr("ry", 10)
            .lower();
    }

    // Add a box under the 'Group By' select for a dynamic/updating legend based on the 'group by' value
    if (phoneBrowsing === true) {
        vis.legendSVG = d3.select("#tilechart-mobile-legend-area");
    }
    else {
        vis.legendSVG = d3.select("#tilechart-legend-area");
    }

    // Set this boolean to true once tilechart has rendered for the first time. Used by other annotation functions in the main
    // controller to keep events from firing too early (before tilechart render) on very fast scrolls
    vis.tilechartReady = false;

    // Set up the chosen.js multi-select with complaint types/counts
    vis.setComplaintTypes();
    // Initialize the tooltips that fire on hover over a tile
    vis.setToolTips();
    // Format data and create/update visualization
    vis.wrangleData();
}


// This will gather variable values and format data correctly render/re-render tilechart
TileChart.prototype.wrangleData = function() {

  console.log("wrangling");

    startRange = graphic.getStartRange();
    startDate = graphic.getStartDate();
    endRange = graphic.getEndRange();
    maxDateOffset = graphic.getMaxDateOffset();

    const vis = this;

    // Update the represented attribute for the 'group by' value
    if (phoneBrowsing === true) {
        vis.representedAttribute = $("#mobile-group-by-select").val();
    }
    else {
        vis.representedAttribute = $("#sort-feature-select").val();
    }

    // If this is the first time the TileChart is rendered (determined in main.js controller), set the timeline to include all dates
    if (initTileChart === true) {
        initTileChart = false;

        endRange = utils.addMonths(startRange, maxDateOffset);
        $("#end-date-display")
            .text(d3.timeFormat("%b '%y")(endRange));

        var sliderValue = utils.monthDiff(startDate, endRange);
        $("#slider-div")
            .slider("values", 1, sliderValue);
    }

    // Filter full dataset (loaded as officerDisciplineResults and processed in main.js controller) to
    // 1. Only include investigations within the dates designated on the timeline slider
    // 2. Only include investigations whose types are selected in the 'Complaint Classification' multi-select
    // 3. Sort all tiles by date (this will remain one of the ways the tiles are sorted, but will ultimately be secondary to 'group by', if selected)

    if (phoneBrowsing === false) {

      officerDisciplineResults = graphic.getOfficerDisciplineResults();
      startRange = graphic.getStartRange();
      endRange = graphic.getEndRange();

      vis.chartData = officerDisciplineResults
          .filter(d => d.date_received >= startRange && d.date_received <= endRange)
          .filter(d => vis.selectedComplaintTypes.includes(d.allegations_investigated))
          .sort((a, b) => a.date_received - b.date_received);


        // Update the counts on the complaint types in the 'Complaint Classification' multi-select with counts based on filtered dataset
        vis.updateComplaintTypes();
    }
    else {
        let startYear = $("#mobile-start-year-select").val();
        let endYear = $("#mobile-end-year-select").val();

        let singleSelectedComplaintType = $("#mobile-complaint-type-select").val()
            .replace(/-/g, ' ');

        vis.chartData = officerDisciplineResults
            .filter(d => {
                return d.date_received.getFullYear() >= startYear && d.date_received.getFullYear() <= endYear;
            })
            .filter(d => {
                if (singleSelectedComplaintType === "All") {
                    return true;
                }
                else {
                    return d.allegations_investigated === singleSelectedComplaintType;
                }
            })
            .sort((a, b) => a.date_received - b.date_received);
    }

    // console.log(vis.chartData.length);

    // Establish sort order for given 'group by' list (this is in reverse because of the unknowns)
    vis.reverseSortOrder = vis.representedVals[vis.representedAttribute].slice().reverse();

    // If there's a 'group by' attribute selected (i.e. not 'no_group'), re-sort chart data based on this attribute (tiles will retain secondary sort of date)
    if (vis.representedAttribute !== 'no_group') {
        vis.chartData = vis.chartData
            .sort( (a, b) => vis.reverseSortOrder.indexOf(b[vis.representedAttribute]) - vis.reverseSortOrder.indexOf(a[vis.representedAttribute]))
    }

    // Keep a running count of how many tiles fall in each outcome group, which will allow the next section to assign indices to each tile,
    // used for placing the tiles in the correct position within their outcome group
    vis.finalOutcomeIndices = {
        "Guilty Finding": 0,
        "No Guilty Findings": 0,
        "Training/Counseling": 0,
        "No Sustained Findings": 0,
        "Discipline Pending": 0,
        "Investigation Pending": 0
    }

    // Assign an index to each tile within its outcome group so that it can be properly positioned using an offset from the group's outcomeCoordinates
    vis.chartData.forEach( d => {
        d.final_state_index = vis.finalOutcomeIndices[d.end_state];
        vis.finalOutcomeIndices[d.end_state] += 1
    });


    // Set the color scale domain based on 'group by' attribute
    vis.color
        .domain(vis.representedVals[vis.representedAttribute]);

    // Unpin/hide the highlighted complaint if user alters the tilechart on mobile
    stickyTooltip = false;
    vis.tip.hide();

    // Update the legend under the 'Group By' select based on the selected 'group by' attribute
    vis.updateLegend();

    // Render/update tilechart tiles
    vis.updateVis();
};


TileChart.prototype.updateVis = function() {
    const vis = this;

    outcomeColors = graphic.getOutcomeColors();

    // JOIN data with any existing elements
    vis.tilechart = vis.g
        .selectAll("rect")
        .data(vis.chartData , d => d.discipline_id);


    // EXIT old elements not present in new data (this shouldn't be the case)
    vis.tilechart
        .exit()
            .remove();

    // ENTER new elements present in the data...
    vis.tilechart
        .enter()
            .append("rect")
                .attr("class", "complaint-box")
                // .style("fill-opacity", 0.9)
                // Initial X and Y coordinates for the tile are set to center top of the visualization area, where they'll 'enter' from
                .attr("y", -100)
                .attr("x", vis.col2x + vis.trueBlockWidth * vis.colWidths["No Sustained Findings"] / 2)
                .attr("height", vis.blockSize)
                .attr("width", vis.blockSize)
                .attr("fill", d => {
                    // If there's no 'group by' selected, color the tiles according to their outcome group, using the
                    // scale established in the main.js controller file. This will help the user a little in understanding
                    // the TileChart, as this coloring will match the outcome colors from the sunburst above
                    if (vis.representedAttribute === 'no_group') {
                        return outcomeColors(d.end_state);
                    }
                    // Otherwise, color according to the color scale, whose domain has been set according to the 'group by' value
                    else {
                        return vis.color(d[vis.representedAttribute]);
                    }
                })
                .style("stroke", "#f9f9f9")
                .style("stroke-width", () => phoneBrowsing === true ? "1px" : "1px")
                // Mouseenter/mouseout callback functions will trigger/remove tooltips for given investigation tile
                .on("mouseenter", function(d,i,n){
                    // If there's a highlighted tile with a pinned tooltip, we'll be extra cautious about removing that
                    // before making further tooltip changes
                    if (vis.pinnedTooltip === true) {
                        vis.tip.hide();
                        d3.selectAll(".d3-tip").remove();
                        vis.setToolTips();

                        vis.pinnedTooltip = false;
                    }
                    if (phoneBrowsing === true) {
                        vis.svg.selectAll("rect.complaint-box").filter(x => x.discipline_id === d.discipline_id && d.complaint_id !== "15-0268").attr("fill", "black");
                    }


                    vis.tip.show(d,this);

                    if (phoneBrowsing === true) {

                        let tooltip = $(".d3-tip");
                        let tooltipHeight = tooltip[0].getBoundingClientRect().height;

                        tooltip
                          // .css("position", "fixed")
                            .css("left", 5)
                            .css("top", () => n[i].getBBox().y > vh/2 ?
                                n[i].getBBox().y - tooltipHeight - 2 :
                                n[i].getBBox().y + vis.blockSize + 2);

                        document.getElementById("chart-area").appendChild(d3.select(".d3-tip").node());

                        $(".close-tooltip")
                            .css("top", "15px")
                            .css("right", "15px")
                            .on("click", () => {
                                console.log("clicked");
                                vis.tip.hide();
                            })
                    }

                    tooltipVisible = true;
                    stickyTooltip = false;

                    $(".close-tooltip")
                      .on("click", () => {
                        console.log("clicked");
                        vis.tip.hide();
                      })


                })
                .on("mouseout", (d) => {
                    $(".d3-tip")
                        .css('opacity', 0)
                        .css('pointer-events', 'none');

                    tooltipVisible = false;

                    if (phoneBrowsing === true) {
                        vis.svg.selectAll("rect.complaint-box").filter(x => x.discipline_id === d.discipline_id)
                            .attr("fill", d => {
                                if (vis.representedAttribute === 'no_group') {
                                    return outcomeColors(d.end_state);
                                }
                                else {
                                    return vis.color(d[vis.representedAttribute]);
                                }
                            });
                    };
                })
                // After initializing in the top center of the visual, tile will transition to correct outcome group and correct position within that outcome group
                // using the outcomeCoordinates dict and the final_state_index assigned in the wrangleData() function for its offset within that tile group
                // .transition()
                //     .duration(0)
                //     .delay(0)
                    .attr("x",  d => vis.outcomeCoordinates[d.end_state][0] + vis.trueBlockWidth * (d.final_state_index%vis.colWidths[d.end_state]))
                    .attr("y", d => vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * ~~(d.final_state_index/vis.colWidths[d.end_state]))
                    // .on("end", function() {
                        // Now, tilechartReady is set to true, where it will remain permanently. Initialized as false to protect against things that shouldn't run
                        // prior to full initialization running from the main.js controller on very fast scrolls.
                    // });
                    //
                    vis.tilechartReady = true;


    // For tile already in place, find/move to new position based on updated sort order. Because tiles are sorted by 'group by' attribute and date,
    // there's a level or re-arranging that needs to take place among existing tiles whenever parameters change and new tile enter/leave.
    // This process was kind of a nightmare to sort out, but this works!
    vis.tilechart
        // .transition()
        //     .duration(600)
            // .delay(0)
                .attr("x",  d => vis.outcomeCoordinates[d.end_state][0] + vis.trueBlockWidth * (d.final_state_index%(vis.colWidths[d.end_state])))
                .attr("y", (d) => vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * Math.floor(1.0*(d.final_state_index)/vis.colWidths[d.end_state]))
                .attr("fill", d => {
                    if (vis.representedAttribute === 'no_group') {
                        return outcomeColors(d.end_state);
                    }
                    else {
                        return vis.color(d[vis.representedAttribute]);
                    }
                })
                .attr("height", vis.blockSize)
                .attr("width", vis.blockSize)
                // .attr("stroke-width", 0)
                // .attr("stroke", "none")
                // .style("fill-opacity", 0.9)


};

// Pull a featured tile out to enlarge/pin tooltip. This is designed for the corresponding annotation slide,
// which discusses the 'Stories Behind the Complaints' and shows the user that they can read details by hovering
TileChart.prototype.highlightTile = function(disciplineID) {
    const vis = this;
    const transitionDuration = 600;

    console.log("highlight tile");

    // Find the featuredTile based on the input disciplineID (explicitly chosen in this case)
    vis.featuredTile = vis.g.selectAll("rect.complaint-box").filter(d => d.discipline_id === disciplineID);

    // If the selected disciplineID is not on the visualization (due to filtering), choose another featuredTile at random
    if (vis.featuredTile.empty() === true) {
        const noSustainedRects = vis.g.selectAll("rect.complaint-box").filter((d) => d.end_state === "No Sustained Findings");
        // const numRects = vis.g.selectAll("rect.complaint-box")._groups[0].length;
        const numRects = noSustainedRects._groups[0].length;
        const tileIndex = Math.round(utils.getRandomArbitrary(0, numRects-1));

        vis.featuredTile = noSustainedRects.filter((d, i) => i === tileIndex);
    }

    // Save the initial coordinates for the tile so that it can be properly returned
    vis.highlightTileX = vis.featuredTile.attr("x");
    vis.highlightTileY = vis.featuredTile.attr("y");

    activeIndex = graphic.getActiveIndex();
    tileChart = graphic.getTileChart();

    if (activeIndex !== 8) {
        return;
    }
    vis.pinnedTooltip = true;

    // Bring the tile to the front and scale its size up, while keeping it centered (this is why the x/y attrs are so complicated)
    vis.featuredTile
        .raise()
        .transition("highlight-tile")
        .duration(transitionDuration)
            .attr("width", vis.trueBlockWidth*vis.highlightRectScalar - vis.blockSpacing)
            .attr("height", vis.trueBlockWidth*vis.highlightRectScalar  - vis.blockSpacing)
            .attr("x", vis.highlightTileX - (vis.trueBlockWidth*vis.highlightRectScalar - vis.blockSpacing) / 2)
            .attr("y", vis.highlightTileY - (vis.trueBlockWidth*vis.highlightRectScalar - vis.blockSpacing) / 2)
            .attr("stroke-width", 2)
            .attr("stroke", "white")
            .style("opacity", 0.9)
            .attr("box-shadow", "10px 10px")
        // Once the transition is completed, display/pin the corresponding details tooltip
        .on("end", (d) => {
            vis.tip.show(vis.featuredTile._groups[0][0].__data__, vis.featuredTile.node());

            stickyTooltip = true;

            let highlightTip = $(".d3-tip");

            // Get screen coordinates of the corresponding tile
            let tileY = tileChart.featuredTile.node().getBoundingClientRect().y;
            // let tileX = tileChart.featuredTile.node().getBoundingClientRect().x;

            let tileHeight = tileChart.featuredTile.node().getBoundingClientRect().height;
            // let tileWidth = tileChart.featuredTile.node().getBoundingClientRect().width;

            // Get the height of the tooltip so that it can be centered
            let tooltipHeight = highlightTip[0].getBoundingClientRect().height;
            // let tooltipWidth = highlightTip[0].getBoundingClientRect().width;

            // Get the right edge of the corresonding tile
            let tileRight = tileChart.featuredTile.node().getBoundingClientRect().right;


            // Fix position of tooltip on screen and set position based on tile positions calculated above
            // Use the height of the tooltip to make sure it's vertically centered on tile
            // On mobile: it's oriented "south", so the fixed position is a little different, unless it's a random tile
            // or non-standard filters and the tile is on the far left, in which case it'll default back to the "east" orientation


            if (phoneBrowsing === true) {
                let tileY = tileChart.featuredTile.node().getBBox().y;

                highlightTip
                    .css("position", "fixed")
                    .css("top", tileY + tileHeight + 2)
                    .css("left", 5);
                    // .css("left", "25px");

                    document.getElementById("chart-area").appendChild(d3.select(".d3-tip").node());

                    $(".close-tooltip")
                        .css("top", "15px")
                        .css("right", "15px")
                        .on("click", () => {
                            console.log("clicked");
                            vis.tip.hide();
                        })
            }
            else {
                highlightTip
                    .css("position", "fixed")
                    .css("top", tileY + (tileHeight / 2) - (tooltipHeight / 2))
                    .css("left", tileRight + 3);
            }
        });
};


// Return to highlighted tile to its original position and remove pinned tooltip (if not already removed due to user hover)
TileChart.prototype.returnTile = function() {
    const vis = this;

    // Hide and remove the pinned tooltip (its CSS has been changed, so we'll want to get rid of it and totally reset/re-initialize tooltips)
    vis.tip.hide();
    d3.selectAll(".d3-tip").remove();
    // vis.svg.call(vis.tip);
    vis.setToolTips();

    // Return the highlighted tile to its original position using stored X/Y values from the highlightTile() function
    vis.featuredTile
        .transition("return-tile-size")
        // .duration(600)
            .attr("width", vis.blockSize)
            .attr("height", vis.blockSize)
            .attr("x", vis.highlightTileX)
            .attr("y", vis.highlightTileY)
            .attr("stroke-width", 0)
            .attr("stroke", "none")
            .style("opacity", 0.9)
            .attr("box-shadow", "none")
            // When the transition is finished, reset the visual to ensure the tile gets back to the correct new position (in case changes have occured since it was highlighted)
        .on("end", function() {
            // if (activeIndex === 12) {
                vis.wrangleData();
            // }
        });
};

// Used to highlight a particular outcome group and fade the others to draw the user's attention there
// The annotations use this to direct the user's attention to overdue pending investigations
TileChart.prototype.highlightTileSection = function(sectionName) {
    const vis = this;

    vis.g.selectAll("rect")
        .transition("fade-opacity")
            .duration(600)
            .style("fill-opacity", function(d) {
                if (d.end_state === sectionName) {
                    return 1.0;
                }
                else {
                    return 0.3;
                }
            });
};

// Returns regular opacity to all tile sections to negate highlightTileSection() function
TileChart.prototype.returnTileSections = function() {
    const vis = this;

    // vis.tilechart
    //     .style("fill-opacity", 0.9);
};

// Initializes hover tooltips with investigation details
TileChart.prototype.setToolTips = function() {
    const vis = this;

    // Use d3-tip extension to initialize tooltip
    vis.tip = d3Tip()
        .attr('class', 'd3-tip')
        // Offset can be a little complicated due to sticky positioning of the tilechart-tile (only seems to apply on Chrome)
        .offset(d => {
            // console.log(d3.event)
            // console.log(vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * ~~(d.final_state_index/vis.colWidths[d.end_state]));
            // Find offset of the top of the tilechart-wrapper from the top of the page (this will vary based on window size)
            const tileOffset = $("#tilechart-wrapper")[0].getBoundingClientRect().y;
            // Find offset from top of page to tilechart-tile
            const trueMarginSize = $("#tilechart-tile")[0].getBoundingClientRect().y;

            // yOffset will be used to adjust the top position of the tooltip
            // Before the tilechart has fallen into its fixed position, no adjustment is necessary, so this shoul come out to 0
            // After the tilechart has fallen into fixed, position, this will be the difference between the trueMarginSize and the tileOffset
            // Without this offset, the tooltip would render in a position as if the the tilechart is in its original, pre-scroll location
            let yOffset = trueMarginSize - Math.min(trueMarginSize, tileOffset);
            if (phoneBrowsing === true) {
                yOffset = 0;
            }
            let xOffset = 0;

            // If browser isn't Chrome, don't worry about the yOffset issue, it doesn't seem to try to render the tooltip in the original
            // tile position on Firefox/Safari (other browsers untested)
            if (typeof window.chrome === "undefined") {
                yOffset = 0;
            }

            if (phoneBrowsing === true) {
                const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
                const tileX = vis.outcomeCoordinates[d.end_state][0] + vis.trueBlockWidth * (d.final_state_index%vis.colWidths[d.end_state]);
                const rightEdgeDistance = vw - tileX;

                const tooltipTileWidth = vw - 50;

                if (tileX < tooltipTileWidth/2) {
                    xOffset += (tooltipTileWidth/2 - tileX) + 3;
                }
                else if (rightEdgeDistance < tooltipTileWidth/2) {
                    xOffset -= (tooltipTileWidth/2 - rightEdgeDistance) + 3;
                }


                const tileRow = d.final_state_index / (vis.colWidths['No Sustained Findings']);
                if (d.end_state === 'No Sustained Findings' && tileRow <= 60) {
                    yOffset += vis.blockSize / 2;
                }
                else {
                    yOffset -= vis.blockSize / 2;
                }

                $(".d3-tip::after")
                    .css("text-align", "unset")
                    .css("left", "20px");
            }
            // Based on the outcome group, the direction of the tooltip relative to the tile will change, and therefore
            // the offsets will need to change a little too, so that the tooltip is positioned next ot the tile and not on top of it
            else if (vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * Math.floor(1.0*(d.final_state_index)/vis.colWidths[d.end_state]) <= 35) {
                yOffset += vis.blockSize;
            }
            else if (d.end_state === 'No Guilty Findings' || d.end_state === 'Discipline Pending') {
                yOffset -= vis.blockSize;
            }
            else if (d.end_state === 'No Sustained Findings') {

                // Determine tile row by dividing the tile's index number by the width of the 'No Sustained Findings' group
                const tileRow = d.final_state_index / (vis.colWidths['No Sustained Findings']);
                if (tileRow >= 62) {
                  console.log("here",vis.blockSize, yOffset);
                    yOffset -= vis.blockSize;
                }
                else {
                  console.log("there",vis.blockSize / 2, yOffset);

                    xOffset = vis.blockSize;
                    yOffset -= vis.blockSize / 2;
                }
            }
            else if (d.investigative_findings === 'Sustained Finding') {
                xOffset -= vis.blockSize - 1;
                yOffset -= vis.blockSize / 2;
            }
            else {
                xOffset = vis.blockSize;
                yOffset -= vis.blockSize / 2;
            }

            // const tileY = vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * ~~(d.final_state_index/vis.colWidths[d.end_state]);
            if (phoneBrowsing === true) {
                let yVal = d3.selectAll("rect.complaint-box").filter(i => d.discipline_id === i.discipline_id).node().getBBox().y;
                console.log(yVal, yOffset);
                return [yVal + yOffset, 0];
                //return [yVal + yOffset, xOffset];
                // return [d3.event.clientY + yOffset, xOffset];
            }
            else {
                return [yOffset, xOffset];
            }


        })
        // The diretion of the tooltip will vary based on where the tile is located (due to screen size constraints and some very large tooltips)
        // Generally, this is just determined by the outcome group it sits in, with those near the bottom of the screen triggering 'north' tooltips
        // and those towards the top-right triggering 'west' tooltips, while the rest trigger 'east' tooltips
        // Because the 'No Sustained Findings' section is so large and often has tiles near the bottom of the screen, any tile
        // below row 62 of the section will trigger a 'north' tooltip as well
        .direction(d => {
            if (phoneBrowsing === true) {
                const tileRow = d.final_state_index / (vis.colWidths['No Sustained Findings']);
                const tileHorizontalEdgeDistance = vis.mobileSideMargin + (d.final_state_index % vis.blockGroupWidth)*vis.blockSize;

                // if (d.end_state === "Guilty Finding" ||
                //     ((d.end_state === "No Sustained Findings" || d.end_state === "Investigation Pending")
                //         && d.final_state_index % vis.colWidths[d.end_state] < 30)) {
                //     return "e";
                // }
                if (d.end_state === 'No Sustained Findings' && tileRow <= 60) {
                    return "s";
                }
                else {
                    return "n";
                }
            }

            // if (d.complaint_id === "19-0464") {
            if (vis.outcomeCoordinates[d.end_state][1] + vis.trueBlockWidth * Math.floor(1.0*(d.final_state_index)/vis.colWidths[d.end_state]) <= 35) {
                return "s";
            }
            else if (d.end_state === 'No Guilty Findings' || d.end_state === 'Discipline Pending') {
                return "n";
            }
            else if (d.end_state === 'No Sustained Findings') {
                // Determine tile row by dividing the tile's index number by the width of the 'No Sustained Findings' group
                const tileRow = d.final_state_index / (vis.colWidths['No Sustained Findings']);
                if (tileRow >= 62) {
                    return "n";
                }
                else {
                    return "e";
                }
            }
            else if (d.investigative_findings === 'Sustained Finding') {
                return "w";
            }
            else {
                return "e";
            }
        })
        // Set the text of the tooltip itself
        // Most of this is fairly straightforward
        .html(function(d) {

            let tipText = "<div class='tip-text'>";

            tipText += "<span class='detail-title'>Complaint Date</span>: <span class='details'>" + d3.timeFormat("%-m/%d/%y")(d.date_received) + "</span><br>";
            if(d.incident_time) {
                tipText += "<span class='detail-title'>Incident Date</span>: <span class='details'>" + d3.timeFormat("%-m/%d/%y")(d.incident_time) + "</span><br>";
            }
            if (d.officer_id) {
                tipText += "<span class='detail-title'>Officer</span>: <span class='details'>" + d.officer_id + ` (${d.po_race + ', ' + d.po_sex})` +  "</span><br>";
            }
            else {
                tipText += "<span class='detail-title'>Officer</span>: <span class='details'>" + d.officer_initials + ` (${d.po_race + ', ' + d.po_sex})` +  "</span><br>";
            }

            if (d.officer_prior_complaints) {
                tipText += "<span class='detail-title'>Officer Prior Known Complaints</span>: <span class='details'>" + d.officer_prior_complaints + "</span><br>";
            }
            else {
                tipText += '';
            }
            tipText += "<span class='detail-title'>Complainant</span>: <span class='details'>";

            // Only include demographic info that is present on the given investigation, so that we don't end up with phantom commas
            tipText += [d.complainant_race, d.complainant_sex, d.complainant_age].filter(function(attr) {
                return attr;
            }).join(', ');

            tipText += "</span><br>";

            tipText += "<span class='detail-title'>District</span>: <span class='details'>" + d.district_occurrence + ` (Median Income: ${d3.format("$,.0f")(d.district_income)})` + "</span><br>";

            tipText += "<span class='detail-title complaint-id'>Complaint ID:</span> <span class='details complaint-id'>" + d.complaint_id + "<br></span>";

            tipText += "<span class='detail-title'>Complaint Type</span>: <span class='details'>" + d.general_cap_classification + "</span><br>";
            if (d.allegations_investigated) {
                tipText += "<span class='detail-title'>Allegations Investigated</span>: <span class='details'>" + d.allegations_investigated + "</span><br>";
            }

            complaintSummaries = graphic.getComplaintSummaries();

            let complaintSummaryData = complaintSummaries[d.complaint_id];

            let summaryText = '';
            if (complaintSummaryData['summary']) {
                summaryText = complaintSummaryData['summary'];
            }
            else if (complaintSummaryData['shortened_summary']) {
                summaryText = complaintSummaryData['shortened_summary'];
            }

            // This is the designated highlightTile (if available).
            // We'll highlight some particular text on it for annotation purposes, using the calloutSummary() function
            if (d.discipline_id === "15-0268-40106202-Physical Abuse") {
                summaryText = calloutSummary(summaryText);
            }

            tipText += "<span class='detail-title'>Complaint Summary</span>: <span class='details'>" + summaryText + "</span>";
            tipText += "</div>";

            if (phoneBrowsing === true) {
              let closeSVG = '<svg class="close-tooltip" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
              tipText += closeSVG;
            }

            return tipText;
        })
        ;

    // Create actual d3-tip element, which will sit hidden until tip.show() is run.
    // Due to complications with the pinned highlightTile tooltip,
    // we will occasionally clear this element altogether and recall it using the same syntax as below

    vis.svg.call(vis.tip);
    // document.getElementById("chart-area").appendChild(d3.select(".d3-tip").node())
};

// Highlight particular sections of the text in the designated highlightTile, which will enlarge/trigger a tooltip on the
// 'Stories Behind the Complaints' annotation if its in the set of filtered tiles
function calloutSummary(summaryText) {
    const highlights = [
        // 'the officer said, "If you hold your d**k tight it won\'t fall off, do you want me to hold it for you, f*ggot?"',
        // 'he cut him off, stating that his officers would not say anything like that and what occurred was not harassment',
        // 'The sergeant ordered the complainant to put his hands up.  After he was handcuffed, the sergeant kicked him numerous times.'
        'The complainant felt threatened and ran from the males.  He was caught and thrown to the ground by the two males, who kicked and punched the complainant.',
        'told the complainant he and his friends were robbery suspects.',
        'he was not their suspect',
        'The officers then released the complainant to his mother, who took him to the hospital for treatment'
    ];

    highlights.forEach((textBlock) => {
        summaryText = summaryText.replace(textBlock, (`<span style="background-color:rgba(245, 229, 27, 0.5)">${textBlock}</span>`));
    });

    return summaryText;
};

// Set the available options for the 'Complaint Classification' multi-select and trigger the chosen.js wrapper
TileChart.prototype.setComplaintTypes = function() {
    const vis = this;

    vis.incidentTypes.forEach((complaintName) => {
        $("select#incident-type-select")
            .append('<option selected id="' + utils.formatSpacedStrings(complaintName) + '" name="' + complaintName + '" value="' + complaintName + '">' + complaintName + '</option><br>');
    });

    // A change to the multi-select will update the selected complaint types and update the visualization with this filtering
    $(".chosen-select")
        .chosen()
        .on('change', () => {
            vis.selectedComplaintTypes = $(".chosen-select").chosen().val();
            vis.wrangleData();
        });

    vis.selectedComplaintTypes = Array.from(
        $('#incident-type-select :selected').map((d,i) => $(i).val())
    );

};

// On a change to the filtering of investigations, update complaint type counts
TileChart.prototype.updateComplaintTypes = function() {
    const vis = this;

    // Change labels on complaint types to include counts in parentheses according to number of matching investigations in the current set
    vis.selectedComplaintTypes.forEach(d => {
        let numInstances = vis.chartData.filter((x) => x.allegations_investigated === d ).length;
        $(("#incident-type-select option#" + utils.formatSpacedStrings(d))).text((d + ' (' + numInstances + ')'));
    });
    $("#incident-type-select").trigger("chosen:updated");

};

// Updates legend beneath 'Group By' select with values from selected 'group by' category
TileChart.prototype.updateLegend = function() {
    const vis = this;

    let keys = vis.representedVals[vis.representedAttribute].slice();
    keys.push('other/unknown');

    // If 'no_group' is selected as the 'group by' variable, pass through empty keys
    // to remove any existing legend items and prevent anything else from rendering
    if (vis.representedAttribute === 'no_group') {
        keys = [];
    }

    // Add one dot in the legend for each value
    // Size is the size of the legend rectangles (squares)
    const size = 8;
    let topMargin = 15;
    if (phoneBrowsing === true) {
        topMargin = 20;
    }
    const leftMargin = 5;
    const verticalSpacing = 9;
    const horizontalSpacing = 100;

    d3.selectAll(".legend-row").remove()

    const rects = vis.legendSVG
        .style("display", d => {
            if(keys.length > 0) {
                return "flex";
            }
            return null;
        })
        .selectAll(".legend-rect")
        .data(keys, d => d)
        .enter()
        .append("div")
        .style("min-width", "80px")
        .attr("class", "legend-row");

    rects
        .append("div")
        // .attr("x", (d,i) => phoneBrowsing === true ? leftMargin + i*(horizontalSpacing) : leftMargin)
        // .attr("y", (d,i) => phoneBrowsing === true ? topMargin : topMargin + i*(size+verticalSpacing) )
        .attr("class", "legend-rect")
        // .attr("fill-opacity", 0.8)
        .style("background-color", d => vis.color(d));

    rects
        .append("p")
        // .attr("x", (d,i) => phoneBrowsing === true ? leftMargin + size*1.2 + 3 + (i*horizontalSpacing) : leftMargin + size*1.2 + 3)
        // .attr("y", (d,i) => phoneBrowsing === true ? topMargin + (size/2) : topMargin + i*(size+verticalSpacing) + (size/2) )
        .style("color", d => vis.color(d))
        .text(d => d)
        // .attr("text-anchor", "left")
        .attr("class", "legend-label")
        // .style("alignment-baseline", "middle");

};

// Formats and returns text with summary statistics for a given outcome group
// Returns the prevalence of an outcome for each subgroup within 'group by' category
// This is then used for the hover tooltip over the section labels/headers
TileChart.prototype.updateCounts = function(outcome) {
    const vis = this;

    let outputString = '';

    // Because there are subcategories (disciplinary classifications) under 'Sustained Finding' and it's not an end state itself,
    // we need to treat it differently than the others in terms of calculating totals
    // We'll use the stateVar to determine whether or not this is an end state (with 'Sustained Finding' being the only non-end state)
    // and then use this to access the correct attribute within given investigations to filter correctly
    let stateVar = 'end_state';
    if (outcome === 'Sustained Finding') {
        stateVar = 'investigative_findings';
    }

    // Within the current chartData, return the length of only those investigations that match the selected outcome
    const fullGroupCount = vis.chartData.filter(d => d[stateVar] === outcome).length;
    // Find the total number of investigations in the current chartData
    const fullGroupTotal = vis.chartData.length;

    // Calculate the total percentage of investigations falling under the given group using the group's total and total number of filtered investigations
    let percentageVal = ' (' + d3.format('.1f')(100 * (fullGroupCount / fullGroupTotal)) + '%)';
    outputString += '<span' + '>' + '<span>total</span>: ' + fullGroupCount + '/' + fullGroupTotal + percentageVal + '</span><br>';

    // If there's no 'group by' selected, that's it! Just return the total, there are no sub-group percentages to display
    if (vis.representedAttribute === 'no_group') {
        return outputString;
    }

    // Otherwise, for each subgroup within the selected 'group by' category, calculate the precentage that fit in the given outcome group
    // and add that to the text string
    vis.representedVals[vis.representedAttribute].forEach(function(group) {
        let groupCount = vis.chartData.filter( d => d[stateVar] === outcome && d[vis.representedAttribute] === group).length;
        let groupTotal = vis.chartData.filter(d => d[vis.representedAttribute] === group).length;

        if (groupTotal > 0) {
            percentageVal = ' (' + d3.format('.1f')(100 * (groupCount / groupTotal)) + '%)';
        }
        else {
            percentageVal = '';
        }

        outputString += '<span' + ' style="color:' + vis.color(group) + ';"><span>' + group + '</span>: ' + groupCount + '/' + groupTotal + percentageVal + '</span><br>';
    });

    // Return the full text string to be inserted into the hover tooltip over the group labels/headers
    return outputString;
};



// if(!phoneBrowsing){
$(window).on("scroll", function () {

   // d3.select("#annotation-tooltip")
   //      .style("opacity", 0)
   //      .style("z-index", -1);

   // d3.select("#category-tooltip")
   //     .style("opacity", 0);


   if (stickyTooltip === false && tooltipVisible === true) {

     console.log("firing");

       $(".d3-tip")
           .css("opacity", 0.0);

       tooltipVisible = false;

       tileChart = graphic.getTileChart();

       tileChart.svg.selectAll("rect.complaint-box")
            .attr("fill", d => {
                if (tileChart.representedAttribute === 'no_group') {
                    return outcomeColors(d.end_state);
                }
                else {
                    return tileChart.color(d[tileChart.representedAttribute]);
                }
            });
   }
});
// }

export default { TileChart };
