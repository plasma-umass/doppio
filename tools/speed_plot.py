import json
import sys
from datetime import datetime
from optparse import OptionParser

def read_benchmark(fname):
  blob = json.load(open(fname))
  tstamp = blob['timestamp']
  t = datetime.fromtimestamp(tstamp).strftime('%Y-%m-%d')
  label = "%s (%s)" % (blob['commit'][:6], t)
  tests = blob['tests']
  return tstamp, label, tests

def fmt_col(id, label, dtype):
  return "{id: '%s', label: '%s', type: '%s'}" % (id,label,dtype)

def fmt_row(vals):
  frow_elements = ["{v: '%s'}" % vals[0]]
  baseline = float(vals[1])
  for v in vals[2:]:
    frow_elements.append("{v: %f, f: '%d/%d ms'}" % (v/baseline, v, baseline))
  return "{c:[%s]}" % ', '.join(frow_elements)

def combine_to_dataTable(data, hot=True):
  data.sort()  # sorts by timestamp
  columns = [fmt_col('bench','Test','string')]
  for _,label,_ in data[1:]:
    columns.append(fmt_col(label[:6],label,'number'))
  test_order = sorted(data[0][2])
  rows = [[str(test)] for test in test_order]
  idx = int(hot)  # 0 if false, 1 if true
  for _,_,test_data in data:
    #XXX: only works when all tests are the same
    for i,test_name in enumerate(test_order):
      rows[i].append(test_data[test_name][idx])
  # produce the dataTable
  fcols = ', '.join(columns)
  frows = ', '.join(map(fmt_row, rows))
  return "{cols: [%s], rows: [%s]}" % (fcols,frows)

def write_html(title, dataTable, fh=sys.stdout):
  print >>fh, '''<html><head>
  <script type="text/javascript" src="https://www.google.com/jsapi"></script>
  <script type="text/javascript">
     google.load("visualization", "1", {packages:["corechart"]});
     google.setOnLoadCallback(drawChart);
     function drawChart() {
       var data = new google.visualization.DataTable('''
  print >>fh, dataTable
  print >>fh, ''');
    var options = {
      title: '%s',
      hAxis: {title: 'Test', showTextEvery: 1,
        slantedText: true, slantedTextAngle: 50},
      vAxis: {title: 'Time/Baseline'}
    };''' % title
  print >>fh, '''(new google.visualization.ColumnChart(
      document.getElementById('chart_div'))).draw(data, options);
    }
  </script></head><body>
  <div id="chart_div" style="width: 1800px; height: 800px;"></div>
  </body></html>'''

if __name__ == '__main__':
  op = OptionParser()
  op.add_option('-c', '--cold', action='store_true', default=False, help="use cold-start times instead of hot")
  opts, args = op.parse_args()
  if len(args) < 2:
    op.error("Usage: %s baseline.json [benchmark.json]+" % sys.argv[0])
  data = map(read_benchmark, args)
  table = combine_to_dataTable(data, hot=(not opts.cold))
  temp = 'cold' if opts.cold else 'hot'
  write_html('Benchmarks vs %s - %s' %(data[0][1],temp), table)

