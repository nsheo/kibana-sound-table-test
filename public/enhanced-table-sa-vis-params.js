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

import { uiModules } from 'ui/modules';
import enhancedTableSaVisParamsTemplate from './enhanced-table-sa-vis-params.html';
import _ from 'lodash';

uiModules.get('kibana/enhanced-table-sa')
  .directive('enhancedTableSaVisParams', function () {
    return {
      restrict: 'E',
      template: enhancedTableSaVisParamsTemplate,
      link: function ($scope) {
        $scope.totalAggregations = ['sum', 'avg', 'min', 'max', 'count'];
        if ($scope.editorState.params.perPage === undefined) {
          _.extend($scope.editorState.params, $scope.vis.type.params.defaults);
        }

        $scope.addcomputedSaColumn = function (computedSaColumns) {
          $scope.newcomputedSaColumn = true;
          computedSaColumns.push({
            label: 'Value squared',
            formula: 'col0 * col0',
            format: 'number',
            pattern: '0,0',
            datePattern: 'MMMM Do YYYY, HH:mm:ss.SSS',
            alignment: 'left',
            applyAlignmentOnTitle: true,
            applyAlignmentOnTotal: true,
            applyTemplate: false,
            applyTemplateOnTotal: true,
            template: '{{value}}',
            enabled: true
          });
        };

        $scope.removecomputedSaColumn = function (computedSaColumnToDelete, computedSaColumns) {
          const index = computedSaColumns.indexOf(computedSaColumnToDelete);
          if (index >= 0) {
            computedSaColumns.splice(index, 1);
          }

          if (computedSaColumns.length === 1) {
            computedSaColumns[0].enabled = true;
          }
        };

        $scope.initEditorOpen = function () {
          if ($scope.newcomputedSaColumn) {
            $scope.newcomputedSaColumn = false;
            return true;
          }
          else {
            return false;
          }
        };

        $scope.hasSplitColsBucket = function () {
          return _.some($scope.editorState.aggs.aggs, function(agg) {
            return agg.schema.name === 'splitcols' && agg.enabled;
          });
        };

      }
    };
  });
