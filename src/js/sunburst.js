import graphic from "./graphic.js"

let phoneBrowsing = d3.select("body").classed("is-mobile");
let officerDisciplineResults = null;
let outcomeColors = null;
let sunburst = null;

let Sunburst = function(_parentElement) {
    this.parentElement = _parentElement;

    this.initVis();
}

Sunburst.prototype.initVis = function() {
    const vis = this;

    // Dimensions of sunburst. Max width of 850, then scale down based on available window width.
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

    const dimensions = Math.min(vh - 120, Math.min(850, $("#sunburst-area").width()));

    vis.margin = {'top': 15, 'bottom': 0, 'left': 0, 'right': 0};
    vis.width = dimensions - vis.margin.left - vis.margin.right;
    vis.height = dimensions - vis.margin.top - vis.margin.bottom;

    // This allows for better use of the phone screen by translating the sunburst down and making better use of the vertical space
    if (phoneBrowsing === true) {
        vis.radiusOffset = 100;
    }
    else {
        vis.radiusOffset = 0;
    }

    vis.radius = Math.min(vis.width+vis.radiusOffset, vis.height+vis.radiusOffset) / 2;

    vis.displaySecondLevel = false;

    // Arc layout for sunburst
    vis.arc = d3.arc()
        .startAngle(function(d) {
            d.x0s = d.x0;
            return d.x0;
        })
        .endAngle(function(d) {
            d.x1s = d.x1;
            return d.x1;
        })
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(vis.radius / 2)
        .innerRadius(d => d.y0)
        // .outerRadius(d => vis.displaySecondLevel === true || d.depth === 1 ? d.y1 - 1 : d.y0);
        .outerRadius(d => d.y1 - 1);


    // Create hierarchical data
    vis.partition = (data) => d3.partition()
        .size([2 * Math.PI, vis.radius])
            (d3.hierarchy(data)
        .sum(d => d.value));
        // .sort((a, b) => b.value - a.value))

    vis.svg = d3.select(vis.parentElement)
        .append("svg")
        .attr("preserveAspectRatio", function(d){
          if(vh>vw){
            return "xMaxYMin meet";
          }
          return null;
        })
        .attr("viewBox","0 0 "+(vis.width + vis.margin.left + vis.margin.right)*1.05+" "+(vis.height + vis.margin.top + vis.margin.bottom))
        // .attr("width", vis.width + vis.margin.left + vis.margin.right)
        // .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

    vis.g = vis.svg.append("g")
        .attr("transform", "translate(" + vis.margin.left + ", " + vis.margin.top + ")");

    vis.labelFontSize = "14px";
    vis.outlineLabelGroup = vis.g.append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .attr("font-size", vis.labelFontSize);

    vis.labelGroup = vis.g.append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .attr("font-size", vis.labelFontSize);

    // We'll use this later in the attrTween function for animating transitions on the sunburst
    vis.previousAngles = {};

    vis.format = d3.format(",d");

    // Label in center of sunburst with the percentage value of the hovered section
    vis.selectedValPct = vis.g.append("text")
        .attr("transform", "translate(" + (vis.radius - vis.radiusOffset/2) + "," + vis.radius + ")")
        .attr("id", "sunburst-val-pct-text")
        .attr("text-anchor", "middle")
        //.style("fill-opacity", 0.6)
        .text("");

    // Label in the center of the sunburst with count value of the hovered section
    vis.selectedValTotals = vis.g.append("text")
        .attr("transform", "translate(" + (vis.radius - vis.radiusOffset/2) + "," + vis.radius + ")")
        .attr("id", "sunburst-val-total-text")
        .attr("text-anchor", "middle")
        .attr("dy", 22)
        //.style("fill-opacity", 0.6)
        .style("font-size", () => phoneBrowsing === true ? "10px" : "12px")
        .text("");

    // If the select options change in the text above the sunburst, update the visual
    $('.sunburst-select').on('change', function(e) {
        $(this).attr("class", `sunburst-select ${$(this).val()}`);
        vis.wrangleData();
    });

    // Used to prevent labels from the center of the sunburst if they're removed and re-added
    // (in cases where the chart is filtered so that no cases match the outcome)
    vis.previouslyAddedLabels = [];
    vis.mousedOverElement = null;

    vis.wrangleData();
};

Sunburst.prototype.wrangleData = function() {
    const vis = this;

    officerDisciplineResults = graphic.getOfficerDisciplineResults();

    vis.chartData = officerDisciplineResults;

    // Process 'other' or 'all' options for complainant/officer race selects
    ['po', 'complainant'].forEach(function(category) {
        let itemSelect = $(`#sunburst-${category}-race`).val();

        if (itemSelect === 'other') {
            vis.chartData = vis.chartData
                .filter(function(d) {
                    return d[`${category}_race`] !== 'white' && d[`${category}_race`]  !== 'latino' && d[`${category}_race`]  !== 'black';
                })
        }
        else if (itemSelect !== 'all') {
            vis.chartData = vis.chartData
                .filter(function(d) {
                    return d[`${category}_race`] === itemSelect;
                })
        }
    });

    // Process 'all' option for district median income select
    let itemSelect = $(`#sunburst-district-income-group`).val();

    if (itemSelect !== 'all') {
        vis.chartData = vis.chartData
            .filter(function(d) {
                return d['district_income_group'] === itemSelect;
            })
    }

    // Capture total number of cases that match the given filters in order to accurately calculate percentages later
    vis.totalSize = vis.chartData.length;

    // Put data into nest
    let nest = d3.nest()
        .key(function(d) {return d.investigative_findings})
        .map(vis.chartData);

    // Format data with parents/children and counts rather than full arrays of data
    let investigative_result_counts = [];
    ["Sustained Finding", "No Sustained Findings", "Investigation Pending"].forEach(function(i_key) {

        let subnest;
        let disciplinary_result_counts;
        if (i_key === "Sustained Finding" && nest.get("Sustained Finding") !== undefined) {
            subnest = d3.nest()
                .key(function(d) {return d.disciplinary_findings})
                .map(nest.get(i_key));

            disciplinary_result_counts = [];
            ["Guilty Finding", "Training/Counseling", "No Guilty Findings", "Discipline Pending"].forEach(function(d_key) {
                if (subnest.get(d_key) !== undefined) {
                    disciplinary_result_counts.push({'name': d_key, 'value': subnest.get(d_key).length})
                }
            });

            investigative_result_counts.push({'name': i_key, 'children': disciplinary_result_counts})
        }
        else {
            if (nest.get(i_key) !== undefined) {
                investigative_result_counts.push({'name': i_key, 'value': nest.get(i_key).length})
            }
        }
    });

    // Add top-level root element so that data can be properly parsed for sunburst
    vis.data = { 'name': 'investigative_results', 'children': investigative_result_counts };
    // Put data into proper d3 layout, initialized above in initVis()
    vis.root = vis.partition(vis.data);

    let subroot = vis.root.children
        .find(d => typeof d.children !== "undefined" && d.children.length > 0);

    if (typeof subroot !== "undefined") {
        subroot
            .children
            .forEach(child => vis.displaySecondLevel === false ? child.y1 = child.y0 : child.y1 = child.y1);
    };

    vis.updateVis();

};

// Main function to draw and set up the visualization, once we have the data.
Sunburst.prototype.updateVis = function() {
    const vis = this;

    vis.addSunburstSlices();

    vis.addLabelShadows();
    vis.addSunburstLabels();
};


Sunburst.prototype.addSunburstSlices = function() {
    const vis = this;

    outcomeColors = graphic.getOutcomeColors();

    // Join partition data to paths, match existing slices with the outcome name
    vis.plotAreas = vis.g.selectAll("path")
        .data(vis.root.descendants().filter(function(d) {
                return d.depth
            }),
            function(d) {
                return d.data.name;
            })

    // Remove any sunburst slices that are not present in current filtering
    // (e.g. if there are no 'guilty findings' with a particular filter set, remove the 'guilty finding' slice)
    vis.plotAreas
        .exit()
        .remove();

    // Add new outcomes to sunburst as slices (paths)
    vis.plotAreas
        .enter()
        .append("path")
        .attr("parent", function(d) {
            if(d.depth > 1) {
                // If this is a child outcome (disciplinary), add its parent
                return d.parent.data.name.replace(" ", "-");
            }
            else {
                // Otherwise, it will be considered its own parent
                return d.data.name;
            }
        })
        .attr("class", function(d) {
            if(d.depth > 1) {
                return "sunburst-segment child";
            }
            else {
                return "sunburst-segment parent " + d.data.name.replace(/ /g, "-");
            }
        })
        .attr("id", function(d) {
            return d.data.name.replace(/ /g, "-");
        })
        .attr("fill", function(d) {
            return outcomeColors(d.data.name);
        })
        .attr("value", function(d) {
            return d.value;
        })
        .attr("d", vis.arc)
        //.attr("fill-opacity", 0.6)
        .attr("transform", "translate(" + (vis.radius-(vis.radiusOffset / 2)) + "," + (vis.radius) + ")")
        .on("mouseover", function(d,i,n) {
            $("#sunburst-area path").removeAttr('style');
            vis.mouseover(d.value, n[i]);
        })
        .on("mouseout", function() {
            vis.mouseout();
        })
        .transition("change-slices")
            .duration(1000)
            .ease(d3.easePoly)
            // Run custom attrTween function on transitions to smoothly change arc size
            .attrTween("d", arcTweenPath)
        // We'll use the previousAngles dict initialized earlier to store angles.
        // This is going to help the arcTweenPath function when it needs to re-add a slice that wasn't present in a previous filtering
        .each(function(d) {
            vis.previousAngles[d.data.name] = vis.previousAngles[d.data.name] ?
                {'x0': d.x0, 'x1': d.x0, 'y0': vis.previousAngles[d.data.name].y0, 'y1': vis.previousAngles[d.data.name].y1 }
                : {'x0': d.x0, 'x1': d.x1, 'y0': 0, 'y1': 0}
        });

    vis.plotAreas
        .attr("value", function(d) {
            return d.value;
        })
        .transition()
            .duration(1000)
            .ease(d3.easePoly)
            .attrTween("d", arcTweenPath);

    function arcTweenPath(a, i) {

        // Starting point for the angles will be determined from the previousAngles dict
        let oi = d3.interpolate({
            x0: vis.previousAngles[a.data.name].x0,
            x1: vis.previousAngles[a.data.name].x1,
            y0: vis.previousAngles[a.data.name].y0,
            y1: vis.previousAngles[a.data.name].y1
        }, a);

        // Custom interpolator to smoothly transition the x values on a given arc from previous position to new one
        // This function is what's returned to the attrTween attribute as the interpolator to use for the transition
        function tween(t) {
            let b = oi(t);
            a.x0s = b.x0;
            a.x1s = b.x1;
            a.y0s = b.y0;
            a.y1s = b.y1;
            return vis.arc(b);
        }

        vis.previousAngles[a.data.name].x0 = a.x0;
        vis.previousAngles[a.data.name].x1 = a.x1;
        vis.previousAngles[a.data.name].y0 = a.y0;
        vis.previousAngles[a.data.name].y1 = a.y1;

        return tween;
    }

    // If there's an existing moused-over element (triggered by annotations), then on any filter change (by annotation or user),
    // we'll want to update the numbers in the center text, as if it had been mousedover, so cause an artificial trigger of the mosueover function
    if (vis.mousedOverElement != null) {

        sunburst = graphic.getSunburst();

        if (sunburst.plotAreas._groups[0].includes(sunburst.mousedOverElement)) {
            const guiltyFindingElement = $(vis.mousedOverElement)[0];
            const guiltyValue = guiltyFindingElement.getAttribute("value");
            vis.mouseover(guiltyValue, vis.mousedOverElement);
        }
        else {
            vis.mouseout();
        }

    }
};


Sunburst.prototype.addLabelShadows = function() {
    const vis = this;

    // Join data to text labels, using the outcome name as a key
    vis.labelShadows = vis.outlineLabelGroup.selectAll("text.sunburst-chart-label-shadows")
        .data(vis.root.descendants().filter(d => d.depth), d => d.data.name);

    // Remove any labels that are not present in current filtering
    // (e.g. if there are no 'guilty findings' with a particular filter set, remove the 'guilty finding' label)
    vis.labelShadows
        .exit()
        .remove();

    // Add new outcomes to sunburst as labels
    vis.labelShadows
        .enter()
        .append("text")
        .attr("class", "sunburst-chart-label-shadows")
        .style("stroke",function(d){
          return outcomeColors(d.data.name);
        })
        .attr("opacity", d => vis.displaySecondLevel === false && d.depth > 1 ? 0.0 : 1.0)
        // The entrance of a 'new' label will be different if it is genuinely new vs. if it just didn't appear in the last filtering
        // A truly new label (on sunburst entrance) will 'spawn' from the center of the sunburst, one that is making a 're-entrance'
        // will initially re-appear where it was last located before making its way to its new position
        .attr("transform", d => {
            if (vis.previouslyAddedLabels.includes(d.data.name)) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
            }
            else {
                vis.previouslyAddedLabels.push(d.data.name);
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius})`;
            }
        })
        .attr("dy", "0.35em")
        .text(d => d.data.name)
        .transition()
            .duration(1000)
            .ease(d3.easePoly)
            .attr("transform", function(d) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
            });

    // Update existing labels position to center them on new corresponding slice position
    vis.labelShadows
        .transition()
        .delay(0)
        .duration(1000)
        .ease(d3.easePoly)
        .attr("opacity", d => vis.displaySecondLevel === false && d.depth > 1 ? 0.0 : 1.0)
        .attr("transform", function(d) {
            const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
            const y = (d.y0 + d.y1) / 2;
            return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
        });

    vis.outlineLabelGroup.raise();
};


Sunburst.prototype.addSunburstLabels = function() {
    const vis = this;

    // Join data to text labels, using the outcome name as a key
    vis.labels = vis.labelGroup.selectAll("text.sunburst-chart-labels")
        .data(vis.root.descendants().filter(d => d.depth), d => d.data.name);

    // Remove any labels that are not present in current filtering
    // (e.g. if there are no 'guilty findings' with a particular filter set, remove the 'guilty finding' label)
    vis.labels
        .exit()
        .remove();

    // Add new outcomes to sunburst as labels
    vis.labels
        .enter()
        .append("text")
        .attr("class", "sunburst-chart-labels")
        .attr("opacity", d => vis.displaySecondLevel === false && d.depth > 1 ? 0.0 : 1.0)
        // The entrance of a 'new' label will be different if it is genuinely new vs. if it just didn't appear in the last filtering
        // A truly new label (on sunburst entrance) will 'spawn' from the center of the sunburst, one that is making a 're-entrance'
        // will initially re-appear where it was last located before making its way to its new position
        .attr("transform", d => {
            if (vis.previouslyAddedLabels.includes(d.data.name)) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
            }
            else {
                vis.previouslyAddedLabels.push(d.data.name);
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius})`;
            }
        })
        .attr("dy", "0.35em")
        .text(d => d.data.name)
        .transition()
            .duration(1000)
            .ease(d3.easePoly)
            .attr("transform", function(d) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
            });

    // Update existing labels position to center them on new corresponding slice position
    vis.labels
        .transition()
        .delay(0)
        .duration(1000)
        .ease(d3.easePoly)
        .attr("opacity", d => vis.displaySecondLevel === false && d.depth > 1 ? 0.0 : 1.0)
        .attr("transform", function(d) {
            const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
            const y = (d.y0 + d.y1) / 2;
            return `translate(${vis.radius - vis.radiusOffset/2}, ${vis.radius}) rotate(${x - 90}) translate(${y},0) rotate(${90 - x}) rotate(${90-x < 180 ? 0 : 180})`;
        });

    vis.labelGroup.raise();
};


// Restore normal opacity levels and clear center text
Sunburst.prototype.mouseout = function() {
    const vis = this;

    vis.mousedOverElement = null;

    //$(".sunburst-segment").attr("fill-opacity", 0.6);

    vis.selectedValPct
        .text("");
    vis.selectedValTotals
        .text("");
};

// Fade all but the current sequence, and display center text
Sunburst.prototype.mouseover = function(value, element) {
    const vis = this;

    vis.mousedOverElement = element;

    // $(".sunburst-segment").attr("fill-opacity", 0.2);

    vis.selectedValPct
        .text(d3.format(".1%")(value/vis.totalSize));

    vis.selectedValTotals
        .text(`(${d3.format(",")(value)} of ${d3.format(",")(vis.totalSize)} investigations)`)

    let parentName = $(element).attr("parent");

    $(element).attr("fill-opacity", 0.8);
    $("." + parentName).attr("fill-opacity", 0.8);
};

// Outline sections provided as parameter (array) for annotation comparative purposes
// Remove these on hover
Sunburst.prototype.createOutlineSections = function(sectionNames) {
    const vis = this;

    vis.mousedOverElement = null;

    sectionNames.forEach(function(sectionName) {
        let idName = sectionName.replace(" ", "-");
        let originalElement = vis.g.select(`path#${idName}`);

        vis.svg.append("path")
            .attr("class", "chart-section-outline")
            .attr("d", originalElement.attr("d"))
            .attr("transform", originalElement.attr("transform") + " translate(" + vis.margin.left + "," + vis.margin.top + ")")
            .attr("stroke-dasharray", ("5, 3"))
            .attr("stroke", "black")
            .attr("stroke-width", "1.5px")
            .attr("fill-opacity", 0.0)
            // .style('pointer-events', 'none')
            .on("mouseover tap", function() {
                vis.removeOutlineSections();
            })
            // .lower();
    })
};

// Remove any outlined sections if the user hovers over them
Sunburst.prototype.removeOutlineSections = function() {
    const vis = this;

    vis.svg.selectAll(".chart-section-outline").remove();

};

export default { Sunburst };
