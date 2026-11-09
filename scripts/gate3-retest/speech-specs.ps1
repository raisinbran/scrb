$specs = @(
  @{track='microphone';voice='Microsoft David Desktop';rate='-15%';long=@(
    'Amber lanterns illuminate quiet gardens beside ancient orchards where patient artists sketch delicate blossoms every morning.',
    'Copper baskets carry ripe peaches through winding valleys while cheerful farmers gather fragrant herbs near wooden cottages.',
    'Crimson ribbons decorate tall windows above peaceful courtyards where nimble dancers practice graceful movements before breakfast.'
  );short=@('Yes.','Correct.','Agreed.','Understood.','Approved.','Ready.','Confirmed.','Certainly.','Excellent.','Precisely.','Indeed.','Absolutely.','Accepted.','Complete.','Finished.','Clear.','Noted.','Fine.','Valid.','True.')},
  @{track='meeting';voice='Microsoft Zira Desktop';rate='default';long=@(
    'Silver rockets orbit distant planets beyond frozen moons as curious scientists measure radiation across enormous cosmic fields.',
    'Violet comets traverse silent nebulae past brilliant stars during careful telescope surveys detecting unusual stellar patterns tonight.',
    'Golden satellites transmit digital signals toward remote stations beneath polar skies after automated sensors identify magnetic storms.'
  );short=@('Proceed.','Continue.','Advance.','Launch.','Begin.','Resume.','Transmit.','Receive.','Observe.','Inspect.','Measure.','Record.','Report.','Verify.','Review.','Assess.','Check.','Test.','Save.','Send.')}
)
$constructedUnits=@()
foreach ($spec in $specs) {
  $utterance=0
  foreach ($kind in @('long','short')) {
    foreach ($text in $spec[$kind]) {
      $words=$text.Split(' ',[StringSplitOptions]::RemoveEmptyEntries)
      $id='{0}-utt{1:D2}' -f $spec.track,$utterance
      $parts=@()
      if ($words.Count -gt 1) { $parts+=@{role='prefix';text=($words[0..($words.Count-2)] -join ' ')} }
      $parts+=@{role='final';text=$words[-1]}
      $index=0
      foreach ($part in $parts) {
        $constructedUnits+=@{unit_id=$id+'-u'+$index;utterance_id=$id;utterance_text=$text;track=$spec.track;kind=$kind;voice=$spec.voice;role=$part.role;text=$part.text;prosody_rate=$spec.rate}
        $index++
      }
      $utterance++
    }
  }
}
