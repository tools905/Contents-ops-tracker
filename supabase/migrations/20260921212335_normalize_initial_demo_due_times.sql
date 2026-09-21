-- Keep demonstration deadlines inside normal India working hours.
update public.content_items
set due_at = case title
  when 'September admissions campaign calendar'
    then (current_date + 2 + time '11:00') at time zone 'Asia/Kolkata'
  when 'CFP vs CWM: which path fits whom?'
    then (current_date + 3 + time '15:00') at time zone 'Asia/Kolkata'
  when 'Inside the Wealth & Alternates Convention'
    then (current_date + 5 + time '12:00') at time zone 'Asia/Kolkata'
  when 'Estate planning myths: carousel'
    then (current_date + 6 + time '16:00') at time zone 'Asia/Kolkata'
  when 'Executive program enrolment deadline'
    then (current_date + 8 + time '17:30') at time zone 'Asia/Kolkata'
  when 'How compounding changes long-term outcomes'
    then (current_date + 10 + time '13:00') at time zone 'Asia/Kolkata'
  else due_at
end
where created_by = (
  select p.id from public.profiles p
  where lower(p.email) = 'aditi@buildablelabs.com'
  limit 1
)
and title in (
  'September admissions campaign calendar',
  'CFP vs CWM: which path fits whom?',
  'Inside the Wealth & Alternates Convention',
  'Estate planning myths: carousel',
  'Executive program enrolment deadline',
  'How compounding changes long-term outcomes'
);
