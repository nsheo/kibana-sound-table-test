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

import { i18n } from '@kbn/i18n';
import { AggGroupNames } from 'ui/vis/editors/default';
import { Schemas } from 'ui/vis/editors/default/schemas';
import { setup as visualizations } from '../../../src/legacy/core_plugins/visualizations/public/np_ready/public/legacy';
import { npSetup } from './legacy_imports';
import { createFiltersFromEvent } from '../../../src/legacy/core_plugins/visualizations/public/np_ready/public/filters/vis_filters';
import { prepareJson, prepareString } from '../../../src/legacy/core_plugins/visualizations/public/np_ready/public/legacy/build_pipeline';

import tableVisTemplate from './enhanced-table-sa-vis.html';
import { EnhancedTableSaVisualizationController } from './vis_controller';
import './enhanced-table-sa-vis-params';
import './draggable';
import { enhancedTableRequestHandler } from './data_load/enhanced-table-request-handler';
import { enhancedTableResponseHandler } from './data_load/enhanced-table-response-handler';
import { visualization } from './data_load/enhanced-table-sa-visualization-fn';


// define the visType object, which kibana will use to display and configure new Vis object of this type.
const tableVisTypeDefinition = {
  type: 'table',
  name: 'enhanced-table-sa',
  title: i18n.translate('tableVis.enhancedTableSaVisTitle', {
    defaultMessage: 'Enhanced Table Sound Alarm'
  }),
  icon: 'visTable',
  description: i18n.translate('tableVis.enhancedTableSaVisDescription', {
    defaultMessage: 'Same functionality than Data Table, but with enhanced features like computed columns, filter bar and pivot table.'
  }),
  visualization: EnhancedTableSaVisualizationController,
  visConfig: {
    defaults: {
      perPage: 10,
      showPartialRows: false,
      showMetricsAtAllLevels: false,
      sort: {
        columnIndex: null,
        direction: null
      },
      showTotal: false,
      totalFunc: 'sum',
      computedColumns: [],
      computedColsPerSplitCol: false,
      hideExportLinks: false,
      stripedRows: false,
      showFilterBar: false,
      filterCaseSensitive: false,
      filterBarHideable: false,
      filterAsYouType: false,
      filterTermsSeparately: false,
      filterHighlightResults: false,
      filterBarWidth: '25%',
	  soundAlarmUsage: false,
	  soundAlarmBaseUnit: 'value',
	  soundAlarmLabels: null,
	  soundAlarmThreshold: null
    },
    template: tableVisTemplate
  },
  editorConfig: {
    optionsTemplate: '<enhanced-table-sa-vis-params></enhanced-table-sa-vis-params>',
    schemas: new Schemas([
      {
        group: AggGroupNames.Metrics,
        name: 'metric',
        title: i18n.translate('visTypeTable.tableVisEditorConfig.schemas.metricTitle', {
          defaultMessage: 'Metric'
        }),
        aggFilter: ['!geo_centroid', '!geo_bounds'],
        aggSettings: {
          top_hits: {
            allowStrings: true
          }
        },
        min: 1,
        defaults: [{ type: 'count', schema: 'metric' }]
      },
      {
        group: AggGroupNames.Buckets,
        name: 'split',
        title: i18n.translate('visTypeTable.tableVisEditorConfig.schemas.splitTitle', {
          defaultMessage: 'Split table'
        }),
        min: 0,
        max: 1,
        aggFilter: ['!filter']
      },
      {
        group: AggGroupNames.Buckets,
        name: 'bucket',
        title: i18n.translate('visTypeTable.tableVisEditorConfig.schemas.bucketTitle', {
          defaultMessage: 'Split rows'
        }),
        aggFilter: ['!filter']
      },
      {
        group: AggGroupNames.Buckets,
        name: 'splitcols',
        title: i18n.translate('tableVis.tableVisEditorConfig.schemas.splitcolsTitle', {
          defaultMessage: 'Split cols'
        }),
        aggFilter: ['!filter'],
        max: 1,
        editor: '<div class="hintbox"><i class="fa fa-danger text-info"></i> This bucket must be the last one</div>'
      }
    ])
  },
  requestHandler: enhancedTableSaRequestHandler,
  responseHandler: enhancedTableSaResponseHandler,
  events: {
    filterBucket: {
      defaultAction: function (event) {
        event.aggConfigs = event.data[0].table.columns.map(column => column.aggConfig);
        const filters = createFiltersFromEvent(event);
        return filters;
      }
    }
  },
  hierarchicalData: function (vis) {
    return Boolean(vis.params.showPartialRows || vis.params.showMetricsAtAllLevels);
  },
  toExpression: function (vis) {
    const visState = vis.getCurrentState();
    const visConfig = visState.params;
    const { indexPattern } = vis;
    let pipeline = `enhanced_table_visualization type='${vis.type.name}'
      ${prepareJson('visConfig', visConfig)}
      metricsAtAllLevels=${vis.isHierarchical()}
      ${prepareJson('aggConfigs', visState.aggs)}
      partialRows=${vis.type.requiresPartialRows || vis.params.showPartialRows || false} `;
    if (indexPattern) {
      pipeline += `${prepareString('index', indexPattern.id)}`;
    }
    return pipeline;
  }
};

//register enhanced-table visualization function, to customize elasticsearch response transformation to table data
npSetup.plugins.expressions.registerFunction(visualization);

//register the vis type definition
visualizations.types.createBaseVisualization(tableVisTypeDefinition);
