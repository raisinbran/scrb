param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output already exists; no automatic repeat.' }
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
using System.Security;
public class RenderedMark { public string name; public double seconds; }
public class SpeechRenderer {
  public static RenderedMark[] Render(string voice, string text, string output) {
    var marks = new List<RenderedMark>();
    using (var s = new SpeechSynthesizer()) {
      s.SelectVoice(voice);
      s.SetOutputToWaveFile(output, new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      s.BookmarkReached += (o,e) => marks.Add(new RenderedMark {name=e.Bookmark, seconds=e.AudioPosition.TotalSeconds});
      var words = text.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
      string body = "";
      for (int i=0; i<words.Length; i++) body += "<mark name='s"+i+"'/>"+SecurityElement.Escape(words[i])+"<mark name='e"+i+"'/> ";
      s.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><prosody rate='-15%'>"+body+"</prosody></speak>");
    }
    return marks.ToArray();
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
      $marks = [SpeechRenderer]::Render($spec.voice,$text,$file)
      $words = $text.Split(' ',[StringSplitOptions]::RemoveEmptyEntries)
      if ($marks.Count -ne 2*$words.Count) { throw "Incomplete engine bookmarks for $name" }
      $results += @{id=$name;track=$spec.track;kind=$kind;voice=$spec.voice;file=$name+'.wav';text=$text;marks=$marks}
      $index++
    }
  }
}
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'engine-marks.json') -Encoding UTF8
Write-Output 'Rendered invented sources only; no playback or capture.'
