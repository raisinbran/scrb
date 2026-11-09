using System;
using System.IO;
using System.Security.Cryptography;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
public class UnitRenderResult { public long samples; public string sha256; }
public class UnitRenderer {
  public static UnitRenderResult Render(string voice, string text, string output) {
    if (File.Exists(output)) throw new IOException("Unit output already exists");
    using (var synth = new SpeechSynthesizer()) {
      synth.SelectVoice(voice);
      synth.SetOutputToWaveFile(output, new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      synth.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><prosody rate='-15%'>"+System.Security.SecurityElement.Escape(text)+"</prosody></speak>");
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
