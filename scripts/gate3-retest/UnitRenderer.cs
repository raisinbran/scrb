using System;
using System.IO;
using System.Security.Cryptography;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
public class UnitRenderResult { public long samples; public string sha256; }
public class UnitRenderer {
  // rate is the spec's prosody rate: 'default' (no prosody wrapper) or a signed percentage from the spec.
  public static UnitRenderResult Render(string voice, string text, string rate, string output) {
    if (rate != "default" && !System.Text.RegularExpressions.Regex.IsMatch(rate ?? "", @"^[+-]?[0-9]{1,3}%$")) throw new ArgumentException("Unsupported prosody rate");
    if (File.Exists(output)) throw new IOException("Unit output already exists");
    using (var synth = new SpeechSynthesizer()) {
      synth.SelectVoice(voice);
      synth.SetOutputToWaveFile(output, new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      string body = System.Security.SecurityElement.Escape(text);
      if (rate != "default") body = "<prosody rate='"+rate+"'>"+body+"</prosody>";
      synth.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"+body+"</speak>");
    }
    long count = -1;
    using (var reader = new BinaryReader(File.OpenRead(output))) {
      if (new String(reader.ReadChars(4))!="RIFF") throw new IOException("Not RIFF");
      reader.ReadUInt32();
      if (new String(reader.ReadChars(4))!="WAVE") throw new IOException("Not WAVE");
      bool valid = false;
      while (reader.BaseStream.Position+8<=reader.BaseStream.Length) {
        string id=new String(reader.ReadChars(4)); uint size=reader.ReadUInt32(); long next=reader.BaseStream.Position+size+(size%2);
        if (id=="fmt ") valid=reader.ReadUInt16()==1 && reader.ReadUInt16()==1 && reader.ReadUInt32()==24000 && reader.ReadUInt32()==48000 && reader.ReadUInt16()==2 && reader.ReadUInt16()==16;
        if (id=="data") { if (size%2!=0) throw new IOException("Partial sample"); count=size/2; }
        reader.BaseStream.Position=next;
      }
      if (!valid || count<=0) throw new IOException("Invalid unit format or sample count");
    }
    using (var hash=SHA256.Create()) using (var input=File.OpenRead(output))
      return new UnitRenderResult {samples=count,sha256=BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").ToLowerInvariant()};
  }
}
