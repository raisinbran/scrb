param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output already exists; no automatic repeat.' }
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
Add-Type -ReferencedAssemblies System.Speech,System.Core -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
using System.Security;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Threading;
public class RenderedMark { public string name; public double seconds; }
public class RenderResult { public RenderedMark[] marks; public bool complete; public string timeline; }
public class SpeechRenderer {
  public static RenderResult Render(string voice, string text, string output) {
    var marks = new List<RenderedMark>();
    var gate = new object();
    var received = new List<string>();
    var words = text.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
    var expected = Enumerable.Range(0, words.Length).SelectMany(i => new[]{"s"+i,"e"+i}).ToArray();
    var timeline = output + ".bookmarks.tsv";
    using (var s = new SpeechSynthesizer()) {
      s.SelectVoice(voice);
      s.SetOutputToWaveFile(output, new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      s.BookmarkReached += (o,e) => {
        lock (gate) {
          marks.Add(new RenderedMark {name=e.Bookmark, seconds=e.AudioPosition.TotalSeconds});
          received.Add(e.Bookmark+"@"+DateTime.UtcNow.ToString("o"));
        }
      };
      string body = "";
      for (int i=0; i<words.Length; i++) body += "<mark name='s"+i+"'/>"+SecurityElement.Escape(words[i])+"<mark name='e"+i+"'/> ";
      s.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><prosody rate='-15%'>"+body+"</prosody></speak>");
      var clock = Stopwatch.StartNew();
      using (var log = new StreamWriter(new FileStream(timeline, FileMode.CreateNew, FileAccess.Write))) {
        log.WriteLine("utc\telapsed_ms_after_return\texpected_count\tbookmark_count\tmissing\tduplicates\tunexpected\tout_of_order\treceived_utc");
        while (true) {
          RenderedMark[] snapshot;
          string[] arrivals;
          lock (gate) { snapshot = marks.ToArray(); arrivals = received.ToArray(); }
          var names = snapshot.Select(m => m.name).ToArray();
          var missing = expected.Except(names).ToArray();
          var duplicates = names.GroupBy(n => n).Where(g => g.Count()>1).Select(g => g.Key).ToArray();
          var unexpected = names.Except(expected).ToArray();
          var ordered = names.SequenceEqual(expected.Take(names.Length));
          var complete = names.Length==expected.Length && missing.Length==0 && duplicates.Length==0 && unexpected.Length==0;
          log.WriteLine(String.Join("\t", new[]{DateTime.UtcNow.ToString("o"), clock.ElapsedMilliseconds.ToString(),
            expected.Length.ToString(), names.Length.ToString(), String.Join(",",missing), String.Join(",",duplicates),
            String.Join(",",unexpected), (!ordered).ToString(), String.Join(",",arrivals)}));
          log.Flush();
          if (complete || clock.ElapsedMilliseconds>=5000)
            return new RenderResult { marks=snapshot, complete=complete, timeline=timeline };
          Thread.Sleep((int)Math.Max(0, Math.Min(100, 5000-clock.ElapsedMilliseconds)));
        }
      }
    }
  }
}
'@
$specs = @(
  @{track='microphone';voice='Microsoft David Desktop';long=@(
    'Amber lanterns illuminate quiet gardens beside ancient orchards where patient artists sketch delicate blossoms every morning.',
    'Copper baskets carry ripe peaches through winding valleys while cheerful farmers gather fragrant herbs near wooden cottages.',
    'Crimson ribbons decorate tall windows above peaceful courtyards where nimble dancers practice graceful movements before breakfast.'
  );short=@('Yes.','Correct.','Agreed.','Understood.','Approved.','Ready.','Confirmed.','Certainly.','Excellent.','Precisely.','Indeed.','Absolutely.','Accepted.','Complete.','Finished.','Clear.','Noted.','Fine.','Valid.','True.')},
  @{track='meeting';voice='Microsoft Zira Desktop';long=@(
    'Silver rockets orbit distant planets beyond frozen moons as curious scientists measure radiation across enormous cosmic fields.',
    'Violet comets traverse silent nebulae past brilliant stars during careful telescope surveys detecting unusual stellar patterns tonight.',
    'Golden satellites transmit digital signals toward remote stations beneath polar skies after automated sensors identify magnetic storms.'
  );short=@('Proceed.','Continue.','Advance.','Launch.','Begin.','Resume.','Transmit.','Receive.','Observe.','Inspect.','Measure.','Record.','Report.','Verify.','Review.','Assess.','Check.','Test.','Save.','Send.')}
)
$results = @()
foreach ($spec in $specs) {
  $index = 0
  foreach ($kind in @('long','short')) {
    foreach ($text in $spec[$kind]) {
      $name = '{0}-{1}-{2:D2}' -f $spec.track,$kind,$index
      $file = Join-Path $OutputDirectory ($name+'.wav')
      $render = [SpeechRenderer]::Render($spec.voice,$text,$file)
      $marks = $render.marks
      $words = $text.Split(' ',[StringSplitOptions]::RemoveEmptyEntries)
      if ($marks.Count -ne 2*$words.Count -or -not $render.complete) {
        $timeline = Get-Content -LiteralPath $render.timeline -Raw
        throw "Incomplete engine bookmarks for $name`nTimeline: $($render.timeline)`n$timeline"
      }
      $results += @{id=$name;track=$spec.track;kind=$kind;voice=$spec.voice;file=$name+'.wav';text=$text;marks=$marks}
      $index++
    }
  }
}
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'engine-marks.json') -Encoding UTF8
Write-Output 'Rendered invented sources only; no playback or capture.'
