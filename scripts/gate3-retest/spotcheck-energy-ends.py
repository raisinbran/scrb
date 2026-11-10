"""DRAFT diagnostic, offline: re-measure the acoustic end of every 11th scored unit (combined list, start index 10) in the joined source WAV with three energy rules and compare with the annotated acoustic_end; count shorts inside 170-245 s. Scores nothing."""
import json, wave, array, math
B='C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/renders-units-20261109-r3-derived-1/assembly/'
rows=[]; shorts={}
for tr in ('microphone','meeting'):
    a=json.load(open(B+tr+'-annotations.json'))
    w=wave.open(B+tr+'.wav'); R=w.getframerate(); s=array.array('h'); s.frombytes(w.readframes(w.getnframes()))
    shorts[tr]=[u['id'] for u in a['utterances'] if u['short'] and 170<=u['start'] and u['acoustic_end']<=245]
    for u in a['utterances']: rows.append((tr,u,s,R))
print('rows',len(rows))
def rms(s,i,n): 
    seg=s[i:i+n]; return math.sqrt(sum(v*v for v in seg)/max(1,len(seg)))
def end_energy(s,R,lo,hi,frame_s,rel):
    n=int(frame_s*R); i0=int(lo*R); i1=int(hi*R)
    r=[rms(s,i,n) for i in range(i0,i1,n)]
    peak=max(r); lvl=max(128,peak*rel)
    act=[k for k,v in enumerate(r) if v>=lvl]
    return (i0+(act[-1]+1)*n)/R
out=[]
for k in range(10,len(rows),11):
    tr,u,s,R=rows[k]
    lo=u['last_word_start']-0.05; hi=u['crop_end_bound']
    e_a=end_energy(s,R,lo,hi,0.005,0.03)   # same rule as the measurement (5 ms, 3% of peak)
    e_b=end_energy(s,R,lo,hi,0.010,0.10)   # independent: 10 ms frames, 10% of peak (-20 dB)
    e_c=end_energy(s,R,lo,hi,0.020,0.01)   # 20 ms frames, 1% of peak (-40 dB)
    out.append((k,u['id'],u['short'],round(u['acoustic_end'],3),round(u['reference_spans'][-1]['end'],3),round(e_a-u['acoustic_end'],3),round(e_b-u['acoustic_end'],3),round(e_c-u['acoustic_end'],3),u['reference_words'][-1]))
for o in out: print(*o)
print('n',len(out))
for t,v in shorts.items(): print(t,'shorts strictly inside 170-245:',len(v),v)
for j in (5,6,7):
    d=[abs(o[j]) for o in out]; print('col',j,'max abs',max(d),'mean abs',round(sum(d)/len(d),4))
