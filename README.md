# kibana-sound-table-test

Make from https://github.com/fbaligand/kibana-enhanced-table 
Add Sound Alert by value or row condition

Only test on Kibana version 7.6.2

Create Plugin folder
```
git clone https://github.com/elastic/kibana.git
cd kibana
git reset --hard v7.6.2
mkdir plugins
cd plugins
git clone https://github.com/nsheo/kibana-sound-table-test.git enhanced-table-sa
cd enhanced-table-sa/
yarn install
yarn build --kibana-version 7.6.2

```



in build folder kibana plugin zipped named enhanced-table-sa-1.8.0.zip

unzip this file and move eenhanced-table-sa to kibana/plugins folder

or use enhanced-table-sa.zip in this folder it builded from kibana v7.6.2 and centOS 7