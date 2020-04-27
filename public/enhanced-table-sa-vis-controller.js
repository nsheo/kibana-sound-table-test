/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import _ from 'lodash';

import { computeColumnSaTotal } from './column_sa_total_computer';
import AggConfigResult from './data_load/agg_config_result';

import { npStart } from 'ui/new_platform';
import { AggConfig } from 'ui/agg_types/agg_config';
import { toastNotifications } from 'ui/notify';

// third-party dependencies
import { Parser } from 'expr-eval';
import handlebars from 'handlebars/dist/handlebars';
import buzz from 'buzz';
// EnhancedTableSAVis AngularJS controller
function EnhancedTableSaVisController ($scope, Private, config) {

  class EnhancedTableSaError {
    constructor(message) {
      this.message = message;
    }
  }

  const getConfig = (...args) => config.get(...args);
  const isDarkTheme = getConfig('theme:darkMode');

  handlebars.registerHelper('encodeURIComponent', encodeURIComponent);

  // controller methods

  const createTemplateContext = function (column, row, totalHits, table) {

    // inject column value references
    const templateContext = { total: totalHits };
    _.forEach(column.template.paramsCols, function (templateParamCol) {
      templateContext[`col${templateParamCol}`] = row[templateParamCol].value;
    });

    // inject column total references
    _.forEach(column.template.paramsTotals, function (templateParamTotal) {
      if (table.columns[templateParamTotal].total === undefined) {
        table.columns[templateParamTotal].total = computeColumnSaTotal(templateParamTotal, column.template.totalFunc, table);
      }
      templateContext[`total${templateParamTotal}`] = table.columns[templateParamTotal].total;
    });

    return templateContext;
  };

  const findSplitColIndex = function (table) {
    if (table !== null) {
      return _.findIndex(table.columns, col => col.aggConfig.schema.name === 'splitcols');
    }
    else {
      return -1;
    }
  };

  const getRealColIndex = function (colIndex, splitColIndex) {
    if (splitColIndex !== -1 && colIndex >= splitColIndex && $scope.vis.params.computedColsPerSplitCol) {
      return colIndex + 1;
    }
    else {
      return colIndex;
    }
  };

  const getOriginalColIndex = function (colIndex, splitColIndex) {
    if (splitColIndex !== -1 && colIndex > splitColIndex && $scope.vis.params.computedColsPerSplitCol) {
      return colIndex - 1;
    }
    else {
      return colIndex;
    }
  };

  const findColIndexByTitle = function (columns, colTitle, input, inputType, splitColIndex) {

    let columnIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].title === colTitle) {
        columnIndex = i;
        break;
      }
    }

    if (columnIndex !== -1) {
      return getOriginalColIndex(columnIndex, splitColIndex);
    }
    else {
      throw new EnhancedTableSaError(`In ${inputType} '${input}', column with label '${colTitle}' does not exist`);
    }
  };

  const createFormula = function (inputFormula, formulaType, splitColIndex, columns, totalFunc) {

    let realFormula = inputFormula;

    // convert col[0] syntax to col0 syntax
    realFormula = realFormula.replace(/col\[(\d+)\]/g, 'col$1');

    // convert col['colTitle'] syntax to col0 syntax
    realFormula = realFormula.replace(/col\['([^\]]+)'\]/g, (match, colTitle) => 'col' + findColIndexByTitle(columns, colTitle, inputFormula, formulaType, splitColIndex));

    // set the right column index, depending splitColIndex
    const colRefRegex = /col(\d+)/g;
    realFormula = realFormula.replace(colRefRegex, (match, colIndex) => 'col' + getRealColIndex(parseInt(colIndex), splitColIndex));

    // extract formula param cols
    const formulaParamsCols = [];
    let regexMatch;
    while ((regexMatch = colRefRegex.exec(realFormula)) !== null) {
      let colIndex = parseInt(regexMatch[1]);
      if (colIndex >= columns.length) {
        colIndex = getOriginalColIndex(colIndex, splitColIndex);
        throw new EnhancedTableSaError(`In computed column '${inputFormula}', column number ${colIndex} does not exist`);
      }
      formulaParamsCols.push(colIndex);
    }

    // convert total[0] syntax to total0 syntax
    realFormula = realFormula.replace(/total\[(\d+)\]/g, 'total$1');

    // convert total['colTitle'] syntax to total0 syntax
    realFormula = realFormula.replace(/total\['([^\]]+)'\]/g, (match, colTitle) => 'total' + findColIndexByTitle(columns, colTitle, inputFormula, formulaType, splitColIndex));

    // set the right total index, depending splitColIndex
    const totalRefRegex = /total(\d+)/g;
    realFormula = realFormula.replace(totalRefRegex, (match, colIndex) => 'total' + getRealColIndex(parseInt(colIndex), splitColIndex));

    // extract formula param totals
    const formulaParamsTotals = [];
    while ((regexMatch = totalRefRegex.exec(realFormula)) !== null) {
      let colIndex = parseInt(regexMatch[1]);
      if (colIndex >= columns.length) {
        colIndex = getOriginalColIndex(colIndex, splitColIndex);
        throw new EnhancedTableSaError(`In computed column '${inputFormula}', column number ${colIndex} does not exist`);
      }
      formulaParamsTotals.push(colIndex);
    }

    // create formula parser with custom functions
    const parser = new Parser();
    parser.functions.now = function () {
      return Date.now();
    };
    parser.functions.indexOf = function (strOrArray, searchValue, fromIndex) {
      return strOrArray.indexOf(searchValue, fromIndex);
    };
    parser.functions.lastIndexOf = function (strOrArray, searchValue, fromIndex) {
      if (fromIndex) {
        return strOrArray.lastIndexOf(searchValue, fromIndex);
      }
      else {
        return strOrArray.lastIndexOf(searchValue);
      }
    };
    parser.functions.replace = function (str, substr, newSubstr) {
      return str.replace(substr, newSubstr);
    };
    parser.functions.replaceRegexp = function (str, regexp, newSubstr) {
      return str.replace(new RegExp(regexp, 'g'), newSubstr);
    };
    parser.functions.search = function (str, regexp) {
      return str.search(regexp);
    };
    parser.functions.substring = function (str, indexStart, indexEnd) {
      return str.substring(indexStart, indexEnd);
    };
    parser.functions.toLowerCase = function (str) {
      return str.toLowerCase();
    };
    parser.functions.toUpperCase = function (str) {
      return str.toUpperCase();
    };
    parser.functions.trim = function (str) {
      return str.trim();
    };
    parser.functions.encodeURIComponent = function (str) {
      return encodeURIComponent(str);
    };
    parser.functions.sort = function (array, compareFunction) {
      return array.sort(compareFunction);
    };
    parser.functions.uniq = function (array) {
      return _.uniq(array);
    };

    // parse formula and return final formula object
    try {
      return {
        expression: parser.parse(realFormula),
        paramsCols: formulaParamsCols,
        paramsTotals: formulaParamsTotals,
        totalFunc: totalFunc
      };
    }
    catch (e) {
      throw new EnhancedTableSaError(`Invalid computed column formula '${inputFormula}' (${e.message})`);
    }
  };

  const computeFormulaValue = function (formula, row, totalHits, table) {
    const formulaParams = { total: totalHits };

    // inject column value references
    _.forEach(formula.paramsCols, function (formulaParamCol) {
      formulaParams[`col${formulaParamCol}`] = row[formulaParamCol].value;
    });

    // inject column total references
    _.forEach(formula.paramsTotals, function (formulaParamTotal) {
      if (table.columns[formulaParamTotal].total === undefined) {
        table.columns[formulaParamTotal].total = computeColumnSaTotal(formulaParamTotal, formula.totalFunc, table);
      }
      formulaParams[`total${formulaParamTotal}`] = table.columns[formulaParamTotal].total;
    });

    const value = formula.expression.evaluate(formulaParams);
    return value;
  };

  const createTemplate = function (computedSaColumn, splitColIndex, columns, totalFunc) {

    if (!computedSaColumn.applyTemplate) {
      return undefined;
    }

    // convert old col.i.value syntax and manage 'split cols' case
    let realTemplate = computedSaColumn.template.replace(/col\.(\d+)\.value\s*\}\}/g, 'col$1}}');

    // convert col[0] syntax to col0 syntax
    realTemplate = realTemplate.replace(/col\[(\d+)\]\s*\}\}/g, 'col$1}}');

    // convert col['colTitle'] syntax to col0 syntax
    realTemplate = realTemplate.replace(/col\['([^\]]+)'\]\s*\}\}/g, (match, colTitle) => 'col' + findColIndexByTitle(columns, colTitle, computedSaColumn.template, 'template', splitColIndex) + '}}');

    // set the right column index, depending splitColIndex
    const colRefRegex = /col(\d+)\s*\}\}/g;
    realTemplate = realTemplate.replace(colRefRegex, (match, colIndex) => 'col' + getRealColIndex(parseInt(colIndex), splitColIndex) + '}}');

    // add template param cols
    const templateParamsCols = [];
    let regexMatch;
    while ((regexMatch = colRefRegex.exec(realTemplate)) !== null) {
      const colIndex = parseInt(regexMatch[1]);
      templateParamsCols.push(colIndex);
    }

    // convert total[0] syntax to total0 syntax
    realTemplate = realTemplate.replace(/total\[(\d+)\]\s*\}\}/g, 'total$1}}');

    // convert total['colTitle'] syntax to total0 syntax
    realTemplate = realTemplate.replace(/total\['([^\]]+)'\]\s*\}\}/g, (match, colTitle) => 'total' + findColIndexByTitle(columns, colTitle, computedSaColumn.template, 'template', splitColIndex) + '}}');

    // set the right total index, depending splitColIndex
    const totalRefRegex = /total(\d+)\s*\}\}/g;
    realTemplate = realTemplate.replace(totalRefRegex, (match, colIndex) => 'total' + getRealColIndex(parseInt(colIndex), splitColIndex) + '}}');

    // add template param totals
    const templateParamsTotals = [];
    while ((regexMatch = totalRefRegex.exec(realTemplate)) !== null) {
      const colIndex = parseInt(regexMatch[1]);
      templateParamsTotals.push(colIndex);
    }

    // return final template object
    return {
      compiledTemplate: handlebars.compile(realTemplate),
      paramsCols: templateParamsCols,
      paramsTotals: templateParamsTotals,
      totalFunc: totalFunc
    };
  };

  const renderCell = function (contentType) {
    let result = this.column.fieldFormatter.convert(this.value);
    if (this.templateContext !== undefined) {
      this.templateContext.value = result;
      result = this.column.template.compiledTemplate(this.templateContext);
    }
    if (contentType !== 'html') {
      result = result.replace(/<(?:.|\n)*?>/gm, '');
    }
    else {
      result = { 'markup': result, 'class': this.column.dataAlignmentClass };
    }
    return result;
  };

  /** create a new data table column for specified computed column */
  const createColumn = function (computedSaColumn, index, totalHits, splitColIndex, columns, totalFunc) {

    const fieldFormats = npStart.plugins.data.fieldFormats;
    const FieldFormat = fieldFormats.getType(computedSaColumn.format);
    const fieldFormatParamsByFormat = {
      'string': {},
      'number': { pattern: computedSaColumn.pattern },
      'date': { pattern: computedSaColumn.datePattern }
    };
    const fieldFormatParams = fieldFormatParamsByFormat[computedSaColumn.format];
    const aggSchema = (computedSaColumn.format === 'number') ? 'metric' : 'bucket';
    const aggType = (computedSaColumn.format === 'number') ? 'count' : 'filter';

    // create new column object
    const newColumn = {
      id: `computed-col-${index}`,
      aggConfig: new AggConfig($scope.vis.aggs, { schema: aggSchema, type: aggType }),
      title: computedSaColumn.label,
      fieldFormatter: new FieldFormat(fieldFormatParams, getConfig),
      dataAlignmentClass: `text-${computedSaColumn.alignment}`,
      formula: createFormula(computedSaColumn.formula, 'computed column', splitColIndex, columns, totalFunc),
      template: createTemplate(computedSaColumn, splitColIndex, columns, totalFunc)
    };

    // if computed column formula is just a simple column reference (ex: col0), then copy its aggConfig to get filtering feature
    const simpleColRefMatch = newColumn.formula.expression.toString().match(/^\s*col(\d+)\s*$/);
    if (simpleColRefMatch) {
      const simpleColRefIndex = simpleColRefMatch[1];
      const simpleColRef = columns[simpleColRefIndex];
      if (simpleColRef.aggConfig.isFilterable()) {
        newColumn.aggConfig = new AggConfig(simpleColRef.aggConfig.aggConfigs, simpleColRef.aggConfig);
      }
    }

    // define aggConfig identifiers
    newColumn.aggConfig.id = `1.computed-sa-column-${index}`;
    newColumn.aggConfig.key = `computed-column-sa-${index}`;

    // add alignment options
    if (computedSaColumn.applyAlignmentOnTotal) {
      newColumn.totalAlignmentClass = newColumn.dataAlignmentClass;
    }
    if (computedSaColumn.applyAlignmentOnTitle) {
      newColumn.titleAlignmentClass = newColumn.dataAlignmentClass;
    }

    // add "total" formatter function
    newColumn.aggConfig.fieldFormatter = function (contentType) {
      return function (value) {
        const self = { value: value, column: newColumn };
        if (computedSaColumn.applyTemplate && computedSaColumn.applyTemplateOnTotal) {
          self.templateContext = { total: totalHits };
        }
        return renderCell.call(self, contentType);
      };
    };

    return newColumn;
  };

  const createComputedCell = function (column, row, totalHits, table) {
    const value = computeFormulaValue(column.formula, row, totalHits, table);
    const parent = row.length > 0 && row[row.length-1];
    const newCell = new AggConfigResult(column.aggConfig, parent, value, value);
    newCell.column = column;
    if (column.template !== undefined) {
      newCell.templateContext = createTemplateContext(column, row, totalHits, table);
    }
    newCell.toString = renderCell;
    return newCell;
  };

  const addcomputedSaColumnToTables = function (tables, index, newColumn, totalHits) {
    _.forEach(tables, function (table) {
      if (table.tables) {
        addcomputedSaColumnToTables(table.tables, index, newColumn, totalHits);
        return;
      }

      table.columns.push(newColumn);
      _.forEach(table.rows, function (row) {
        const newCell = createComputedCell(newColumn, row, totalHits, table);
        row.push(newCell);
        row[newColumn.id] = newCell.value;
      });
    });
  };

  const processLinesComputedFilter = function (tables, linesComputedFilterFormula, totalHits) {
    return _.filter(tables, function (table) {
      if (table.tables) {
        table.tables = processLinesComputedFilter(table.tables, linesComputedFilterFormula, totalHits);
        return table.tables.length > 0;
      }

      table.rows = _.filter(table.rows, function (row) {
        return computeFormulaValue(linesComputedFilterFormula, row, totalHits, table);
      });
      return table.rows.length > 0;
    });
  };

  const isInt = (item) => {
    return /^ *[0-9]+ *$/.test(item);
  };

  const hideColumns = function (tables, hiddenColumns, splitColIndex) {
    // recursively call sub-tables
    _.forEach(tables, function (table) {
      if (table.tables) {
        hideColumns(table.tables, hiddenColumns, splitColIndex);
        return;
      }

      if (splitColIndex !== -1 && table.rows.length > 0) {
        table.refRowWithHiddenCols = _.clone(table.rows[0]);
      }

      // retrieve real col indices
      let hiddenColumnIndices = _.map(hiddenColumns, function (item) {
        try {
          if (!isInt(item)) {
            item = findColIndexByTitle(table.columns, item, item, 'hidden column', splitColIndex);
          }
          return getRealColIndex(parseInt(item), splitColIndex);
        }
        catch(e) {
          return table.columns.length;
        }
      });

      // sort from higher to lower index and keep uniq indices
      hiddenColumnIndices = _.uniq(hiddenColumnIndices.sort( (a,b) => b - a));

      // remove hidden columns
      _.forEach(hiddenColumnIndices, function (colToRemove) {
        if (colToRemove < table.columns.length) {
          table.columns.splice(colToRemove, 1);
          _.forEach(table.rows, function (row) {
            row.splice(colToRemove, 1);
          });
        }
      });
    });
  };

  const shouldShowPagination = function (tables, perPage) {
    return tables.some(function (table) {
      if (table.tables) {
        return shouldShowPagination(table.tables, perPage);
      }
      else {
        return table.rows.length > perPage;
      }
    });
  };

  const rowContainsFilterTerm = function (row, termToFind, filterCaseSensitive) {
    return row.some(function (col) {
      let colValue = col.toString();
      if (typeof colValue === 'string') {
        if (!filterCaseSensitive) {
          colValue = colValue.toLowerCase();
        }
        return colValue.includes(termToFind);
      }
      return false;
    });
  };

  const filterTableRows = function (tables, activeFilterTerms, filterCaseSensitive) {
    const filteredTables = _.map(tables, (table) => _.clone(table));
    return _.filter(filteredTables, function (table) {
      if (table.tables) {
        table.tables = filterTableRows(table.tables, activeFilterTerms, filterCaseSensitive);
        return table.tables.length > 0;
      }
      else {
        table.rows = _.filter(table.rows, function (row) {
          return activeFilterTerms.every(function (filterTerm) {
            return rowContainsFilterTerm(row, filterTerm, filterCaseSensitive);
          });
        });
        return table.rows.length > 0;
      }
    });
  };

  const findFirstDataTable = function (table) {
    if (table.tables) {
      if (table.tables.length > 0) {
        return findFirstDataTable(table.tables[0]);
      }
      else {
        return null;
      }
    }
    else {
      return table;
    }
  };

  const DEFAULT_METRIC_VALUE = 0;

  const splitCols = function (table, splitColIndex, totalHits) {

    // process only real tables (with rows)
    if (table.tables) {
      _.forEach(table.tables, function (table) {
        splitCols(table, splitColIndex, totalHits);
      });
      return;
    }

    // define ref row for computed columns
    const refRowForcomputedSaColumn = (table.refRowWithHiddenCols !== undefined) ? table.refRowWithHiddenCols : _.clone(table.rows[0]);
    for (let i = 0; i < refRowForcomputedSaColumn.length; i++) {
      const cell = refRowForcomputedSaColumn[i];
      if (cell.column !== undefined) {
        refRowForcomputedSaColumn[i] = createComputedCell(cell.column, refRowForcomputedSaColumn, totalHits, table);
      }
      else if (cell.type === 'metric') {
        refRowForcomputedSaColumn[i] = new AggConfigResult(cell.aggConfig, null, DEFAULT_METRIC_VALUE, DEFAULT_METRIC_VALUE, cell.filters);
      }
    }

    // initialize new column headers
    const newCols = [];
    for (let i = 0; i < splitColIndex; i++) {
      newCols.push(table.columns[i]);
    }

    // compute new table rows
    const newRows = [];
    let newRow = null;
    const newColNamePrefixes = [];
    const newColDefaultMetrics = [];
    const metricsCount = table.columns.length - 1 - splitColIndex;

    _.forEach(table.rows, function (row) {

      // detect if we should create a row
      let createNewRow = (newRow === null);
      if (!createNewRow) {
        for (let i = 0; i < splitColIndex; i++) {
          if (row[i].value !== newRow[i].value) {
            createNewRow = true;
            break;
          }
        }
      }

      // create a new row
      if (createNewRow) {
        newRow = [];
        for (let i = 0; i < splitColIndex; i++) {
          newRow.push(row[i]);
          newRow[table.columns[i].id] = row[i].value;
        }
        newRows.push(newRow);
      }

      // split col
      const rowSplitColValue = row[splitColIndex].toString();
      let newColIndex = _.indexOf(newColNamePrefixes, rowSplitColValue);

      // create new col
      if (newColIndex === -1) {
        newColNamePrefixes.push(rowSplitColValue);
        newColIndex = newColNamePrefixes.length - 1;
        for (let i = splitColIndex+1; i < row.length; i++) {
          const newCol = _.clone(table.columns[i]);
          newCol.title = metricsCount > 1 ? rowSplitColValue + ' - ' + newCol.title : rowSplitColValue;
          newCols.push(newCol);
          let newColDefaultMetric;
          if (newCol.formula === undefined) {
            newColDefaultMetric = new AggConfigResult(row[i].aggConfig, null, DEFAULT_METRIC_VALUE, DEFAULT_METRIC_VALUE, row[i].filters);
          }
          else {
            newColDefaultMetric = createComputedCell(newCol, refRowForcomputedSaColumn, totalHits, table);
          }
          newColDefaultMetrics.push(newColDefaultMetric);
          for (let j = 0; j < newRows.length - 1; j++) {
            newRows[j].push(newColDefaultMetric);
          }
        }
      }

      // add new col metrics
      for (let i = 0; i < metricsCount; i++) {
        newRow[splitColIndex + (newColIndex * metricsCount) + i] = row[splitColIndex + 1 + i];
      }
      for (let i = 0; i < newColDefaultMetrics.length; i++) {
        const targetCol = splitColIndex + i;
        if (newRow[targetCol] === undefined) {
          newRow[targetCol] = newColDefaultMetrics[i];
        }
      }
    });

    // update rows
    table.rows = newRows;

    // update cols
    table.columns = newCols;
  };

  const notifyError = function(errorMessage) {
    if ($scope.errorMessageNotified === undefined) {
      toastNotifications.addDanger(errorMessage);
      $scope.errorMessageNotified = true;
    }
    else {
      $scope.errorMessageNotified = undefined;
    }
  };

  const colToStringWithHighlightResults = function(initialToString, scope, contentType) {
    let result = initialToString.call(this, contentType);
    if ($scope.filterHighlightRegex !== null && contentType === 'html') {
      if (typeof result === 'string') {
        result = { 'markup': result };
      }
      if (result.markup.indexOf('<span') === -1) {
        result.markup = `<span>${result.markup}</span>`;
      }
      result.markup = result.markup.replace(/>([^<>]+)</g, function (match, group) {
        return '>' + group.replace($scope.filterHighlightRegex, '<mark>$1</mark>') + '<';
      });
    }
    return result;
  };

  const setFullAggConfig = function(table, aggConfigs) {
    if (table.tables) {
      if (table.aggConfig) {
        table.aggConfig = aggConfigs.bySchemaName('split')[0];
      }
      table.tables.forEach(subTable => {
        setFullAggConfig(subTable, aggConfigs);
      });
    }
    else {
      table.columns.forEach(column => {
        column.aggConfig = aggConfigs.byId(column.aggConfig.id) || aggConfigs.byId(column.aggConfig.parentId) || column.aggConfig;
      });
    }
  };

  // filter scope methods
  $scope.doFilter = function () {
    $scope.activeFilter = $scope.vis.filterInput;
  };

  $scope.enableFilterInput = function () {
    $scope.filterInputEnabled = true;
  };

  $scope.disableFilterInput = function () {
    $scope.filterInputEnabled = false;
    $scope.activeFilter = $scope.vis.filterInput = '';
  };

  $scope.showFilterInput = function () {
    return !$scope.visState.params.filterBarHideable || $scope.filterInputEnabled;
  };

  // init controller state
  $scope.activeFilter = $scope.vis.filterInput = '';

  const uiStateSort = ($scope.uiState) ? $scope.uiState.get('vis.params.sort') : {};
  _.assign($scope.visParams.sort, uiStateSort);

  $scope.sort = $scope.visParams.sort;
  $scope.$watchCollection('sort', function (newSort) {
    $scope.uiState.set('vis.params.sort', newSort);
  });

  /** process filter submitted by user and refresh displayed table */
  const processFilterBarAndRefreshTable = function() {

    if ($scope.tableGroups !== undefined) {
      let tableGroups = $scope.esResponse;
      const vis = $scope.vis;
      const params = vis.params;

      // init filterInput & filterHighlightRegex
      if ($scope.vis.filterInput === undefined) {
        $scope.vis.filterInput = $scope.activeFilter;
      }
      $scope.filterHighlightRegex = null;

      // process filter bar
      if (params.showFilterBar && $scope.showFilterInput() && $scope.activeFilter !== undefined && $scope.activeFilter !== '') {

        // compute activeFilterTerms
        const activeFilter = params.filterCaseSensitive ? $scope.activeFilter : $scope.activeFilter.toLowerCase();
        let activeFilterTerms = [ activeFilter ];
        if (params.filterTermsSeparately) {
          activeFilterTerms = activeFilter.replace(/ +/g, ' ').split(' ');
        }

        // compute filterHighlightRegex
        if (params.filterHighlightResults) {
          const filterHighlightRegexString = '(' + _.sortBy(activeFilterTerms, term => term.length * -1).map(term => _.escapeRegExp(term)).join('|') + ')';
          $scope.filterHighlightRegex = new RegExp(filterHighlightRegexString, 'g' + (!params.filterCaseSensitive ? 'i' : ''));
        }

        // filter table rows to display
        tableGroups = _.clone(tableGroups);
        tableGroups.tables = filterTableRows(tableGroups.tables, activeFilterTerms, params.filterCaseSensitive);
      }

      // check if there are rows to display
      const hasSomeRows = tableGroups.tables.some(function haveRows(table) {
        if (table.tables) return table.tables.some(haveRows);
        return table.rows.length > 0;
      });

      // set conditional css classes
      const showPagination = hasSomeRows && params.perPage && shouldShowPagination(tableGroups.tables, params.perPage);
      $scope.tableVisContainerClass = {
        'hide-pagination': !showPagination,
        'hide-export-links': params.hideExportLinks,
        'striped-rows': params.stripedRows,
        'theme-dark': isDarkTheme
      };

      // update $scope
      $scope.hasSomeRows = hasSomeRows;
      if (hasSomeRows) {
        $scope.tableGroups = tableGroups;
      }

      // force render if 'Highlight results' is enabled
      if (hasSomeRows && $scope.filterHighlightRegex !== null) {
        tableGroups.tables.some(function cloneFirstRow(table) {
          if (table.tables) return table.tables.some(cloneFirstRow);
          if (table.rows.length > 0) {
            const clonedRow = _.clone(table.rows[0]);
            table.columns.forEach(function (column) {
              if (table.rows[0][column.id] !== undefined) {
                clonedRow[column.id] = table.rows[0][column.id];
              }
            });
            table.rows[0] = clonedRow;
            return true;
          }
          return false;
        });
      }
    }
  };

  // listen activeFilter field changes, to filter results
  $scope.$watch('activeFilter', processFilterBarAndRefreshTable);


  let isNumeric = function (n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
  }
  /**
   * Recreate the entire table when:
   * - the underlying data changes (esResponse)
   * - one of the view options changes (vis.params)
   */
  $scope.$watch('renderComplete', function watchRenderComplete() {

    try {

      if ($scope.esResponse && $scope.esResponse.newResponse) {

        // init tableGroups
        $scope.hasSomeRows = null;
        $scope.tableGroups = null;
        $scope.esResponse.newResponse = false;
        const tableGroups = $scope.esResponse;
        const totalHits = $scope.esResponse.totalHits;
        const vis = $scope.vis;
        const params = $scope.visParams;

        // set the full AggConfig object on each split table and each column
        setFullAggConfig(tableGroups, vis.aggs);

        // validate that 'Split cols' is the last bucket
        const firstTable = findFirstDataTable(tableGroups);
        let splitColIndex = findSplitColIndex(firstTable);
        if (splitColIndex !== -1) {
          const lastBucketIndex = _.findLastIndex(firstTable.columns, col => col.aggConfig.schema.group === 'buckets');
          if (splitColIndex !== lastBucketIndex) {
            throw new EnhancedTableSaError('\'Split cols\' bucket must be the last one');
          }
        }
		
        // no data to display
        if (totalHits === 0 || firstTable === null) {
          $scope.hasSomeRows = false;
          return;
        }

        // process 'Split cols' bucket: transform rows to cols
        if (splitColIndex !== -1 && !params.computedColsPerSplitCol) {
          splitCols(tableGroups, splitColIndex, totalHits);
        }

        // add computed columns
        _.forEach(params.computedSaColumns, function (computedSaColumn, index) {
          if (computedSaColumn.enabled) {
            const newColumn = createColumn(computedSaColumn, index, totalHits, splitColIndex, firstTable.columns, params.totalFunc);
            addcomputedSaColumnToTables(tableGroups.tables, index, newColumn, totalHits);
          }
        });

        // process lines computed filter
        if (params.linesComputedFilter) {
          const linesComputedFilterFormula = createFormula(params.linesComputedFilter, 'Lines computed filter', splitColIndex, firstTable.columns, params.totalFunc);
          tableGroups.tables = processLinesComputedFilter(tableGroups.tables, linesComputedFilterFormula, totalHits);
        }

        // remove hidden columns
        if (params.hiddenColumns) {
          hideColumns(tableGroups.tables, params.hiddenColumns.split(','), splitColIndex);
        }

        // process 'Split cols' bucket: transform rows to cols
        if (splitColIndex !== -1 && params.computedColsPerSplitCol) {
          splitColIndex = findSplitColIndex(firstTable);
          splitCols(tableGroups, splitColIndex, totalHits);
        }

        // add total label
        if (params.showTotal && params.totalLabel !== '') {
          tableGroups.tables.forEach(function setTotalLabel(table) {
            if (table.tables)
              table.tables.forEach(setTotalLabel);
            else
              table.totalLabel = params.totalLabel;
          });
        }

        // prepare filter highlight results rendering
        if (params.showFilterBar && params.filterHighlightResults) {
          tableGroups.tables.forEach(function redefineColToString(table) {
            if (table.tables) {
              table.tables.forEach(redefineColToString);
            }
            else {
              table.rows.forEach(function(row) {
                row.forEach(function (col) {
                  col.toString = colToStringWithHighlightResults.bind(col, col.toString, $scope);
                });
              });
            }
          });
        }

        // process filter bar
        processFilterBarAndRefreshTable();
		
		//console.log("Check Last Data Table - tableGroups.tables")
		//console.log(tableGroups.tables)
		
		//console.log("Check Parameters - params")
		//console.log(params)
		
		let alarmCheck = false;
		
		// Check Data to Call Alarm
		if (params.soundAlarmUsage) {
			tableGroups.tables.forEach(function alarmCheckRun(table) {
				if(params.soundAlarmBaseUnit === 'value'){
					let labelArray = null;
					let checkColumnLabel = new Array();
					let checkColumnId = new Array();
					
					if(params.soundAlarmLabels != null){
						labelArray = params.soundAlarmLabels.split(',');
					}
					
					table.columns.forEach(function(col) {
						if(labelArray != null){
							labelArray.forEach(function(label){
								console.log("Check forEach - label : " + label)
								if(col.id.startsWith('computed')) {
									if(col.title === label.trim()){
										checkColumnLabel.push(col.title);
										checkColumnId.push(col.aggConfig.id);
									}
								}
								else{
									if(col.name === label.trim()){
										checkColumnLabel.push(col.name);
										checkColumnId.push(col.aggConfig.id);
									}
								}
								
							});
						}
						else {
							checkColumnLabel.push(col.name);
							checkColumnId.push(col.aggConfig.id);
						}
					});
					
					
					//console.log("Check Column data - checkColumnLabel, checkColumnId")
					//console.log(checkColumnLabel)
					//console.log(checkColumnId)
					if(checkColumnId.length > 0){
						table.rows.forEach(function(row) {
							row.forEach(function(rowAggData){
								checkColumnId.forEach(function(colId){
									if(rowAggData.aggConfig.id === colId){
										//console.log("Check rowAggData")
										//console.log(rowAggData)
										if(params.soundAlarmDataType === 'string'){
											alarmCheck = rowAggData.value === params.soundAlarmThreshold ? true : false;
										} 
										else {
											if(isNumeric(params.soundAlarmThreshold) && isNumeric(rowAggData.value)){
												if(params.soundAlarmComparisonOper === 'over'){
													alarmCheck = rowAggData.value > Number(params.soundAlarmThreshold) ? true : false;
												} 
												else if(params.soundAlarmComparisonOper === 'eq'){
													alarmCheck = rowAggData.value == Number(params.soundAlarmThreshold) ? true : false;
												} 
												else {
													alarmCheck = rowAggData.value < Number(params.soundAlarmThreshold) ? true : false;	
												}
											}
										}
									}
									return (alarmCheck);
								});
								return (alarmCheck);
							});
							return (alarmCheck);
						});
					}
				  
				} 
				else if(params.soundAlarmBaseUnit === 'row'){
					
					if(isNumeric(params.soundAlarmThreshold)){
						if(params.soundAlarmComparisonOper === 'over'){
							alarmCheck = table.rows.length > Number(params.soundAlarmThreshold) ? true : false;
						} 
						else if(params.soundAlarmComparisonOper === 'eq'){
							alarmCheck = table.rows.length == Number(params.soundAlarmThreshold) ? true : false;
						} 
						else {
							alarmCheck = table.rows.length < Number(params.soundAlarmThreshold) ? true : false;	
						}
					}
					
				}
				
				if(alarmCheck){
					var sound = document.getElementById("alarmAudio");
					sound.play();

				}
			});
        }
      
      }

      $scope.renderComplete();

    }
    catch (e) {
      if (e instanceof EnhancedTableSaError) {
        notifyError(e.message);
      }
      else {
        throw e;
      }
    }
  });
}

export { EnhancedTableSaVisController };