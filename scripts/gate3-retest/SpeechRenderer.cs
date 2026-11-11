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
  public static RenderResult Render(string voice, string text, string output, string encoding) {
    var marks = new List<RenderedMark>();
    var gate = new object();
    var received = new List<string>();
    var words = text.Split(new[]{' '}, StringSplitOptions.RemoveEmptyEntries);
    var expected = encoding=="B" ? Enumerable.Range(0, words.Length).Select(i => "s"+i).Concat(new[]{"e"+(words.Length-1)}).ToArray() : Enumerable.Range(0, words.Length).SelectMany(i => new[]{"s"+i,"e"+i}).ToArray();
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
      for (int i=0; i<words.Length; i++) {
        body += "<mark name='s"+i+"'/>"+SecurityElement.Escape(words[i]);
        if (encoding=="A" || i==words.Length-1) body += "<mark name='e"+i+"'/>";
        if (i<words.Length-1) body += encoding=="A" ? "<break time='30ms'/>" : " ";
      }
      s.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><prosody rate='-15%'>"+body+"</prosody></speak>");
      var clock = Stopwatch.StartNew();
      using (var log = new StreamWriter(new FileStream(timeline, FileMode.CreateNew, FileAccess.Write))) {
        log.WriteLine("utc\telapsed_ms_after_return\texpected_count\tbookmark_count\tmissing\tduplicates\tunexpected\tout_of_order\taudio_positions_nondecreasing\taudio_positions_seconds\treceived_utc");
        while (true) {
          RenderedMark[] snapshot;
          string[] arrivals;
          lock (gate) { snapshot = marks.ToArray(); arrivals = received.ToArray(); }
          var names = snapshot.Select(m => m.name).ToArray();
          var missing = expected.Except(names).ToArray();
          var duplicates = names.GroupBy(n => n).Where(g => g.Count()>1).Select(g => g.Key).ToArray();
          var unexpected = names.Except(expected).ToArray();
          var ordered = names.SequenceEqual(expected.Take(names.Length));
          var monotonic = snapshot.All(m => !Double.IsNaN(m.seconds) && !Double.IsInfinity(m.seconds) && m.seconds>=0) && snapshot.Zip(snapshot.Skip(1), (a,b) => a.seconds<=b.seconds).All(v => v);
          var complete = names.Length==expected.Length && missing.Length==0 && duplicates.Length==0 && unexpected.Length==0 && ordered && monotonic;
          log.WriteLine(String.Join("\t", new[]{DateTime.UtcNow.ToString("o"), clock.ElapsedMilliseconds.ToString(),
            expected.Length.ToString(), names.Length.ToString(), String.Join(",",missing), String.Join(",",duplicates),
            String.Join(",",unexpected), (!ordered).ToString(), monotonic.ToString(), String.Join(",",snapshot.Select(m => m.name+"="+m.seconds.ToString("R",System.Globalization.CultureInfo.InvariantCulture))), String.Join(",",arrivals)}));
          log.Flush();
          if (complete || clock.ElapsedMilliseconds>=5000)
            return new RenderResult { marks=snapshot, complete=complete, timeline=timeline };
          Thread.Sleep((int)Math.Max(0, Math.Min(100, 5000-clock.ElapsedMilliseconds)));
        }
      }
    }
  }
}
