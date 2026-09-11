-- RescueMesh AI — Knowledge Base Foundation (M11)
--
-- Establishes a curated, structured, filter-searchable disaster-safety
-- knowledge foundation. This is deliberately NOT the RAG pipeline —
-- no embeddings, no chunking, no vector search here. That is the
-- purpose of the pre-existing `knowledge_sources` / `knowledge_chunks`
-- tables (M02), which are untouched by this migration and remain
-- reserved for a future embeddings/RAG module.
--
-- `knowledge_documents` is a separate, simpler table: whole curated
-- articles (not chunks), filterable by category/language/published
-- status, intended to be read through GET /api/knowledge.

-- ---------------------------------------------------------------------------
-- knowledge_documents
-- ---------------------------------------------------------------------------

create table if not exists knowledge_documents (
  id            uuid primary key default gen_random_uuid(),

  title         text not null,
  slug          text not null,

  -- Kept as a checked text column rather than reusing/extending the
  -- `incident_type` enum: categories here intentionally include
  -- "general" (emergency preparedness, not tied to any incident type),
  -- and altering a shared enum used by the `incidents` table is outside
  -- M11's scope.
  category      text not null check (
    category in (
      'flood',
      'earthquake',
      'fire',
      'building_collapse',
      'medical_emergency',
      'missing_person',
      'road_blockage',
      'food_shortage',
      'shelter_need',
      'general'
    )
  ),

  summary       text not null,
  content       text not null,
  source        text,

  -- Matches the existing free-text convention already used by
  -- `incidents.language` / `ExtractionLanguage` ("English" / "Urdu" /
  -- "Roman Urdu") rather than introducing a second language convention.
  language      text not null default 'English' check (
    language in ('English', 'Urdu', 'Roman Urdu')
  ),

  published     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint knowledge_documents_slug_key unique (slug)
);

-- Filtered on individually (category, language) and combined with
-- published in the API's WHERE clause, so a composite index on
-- (published, category) covers the most common query shape without
-- indexing every column.
create index if not exists knowledge_documents_published_category_idx
  on knowledge_documents (published, category);

create index if not exists knowledge_documents_language_idx
  on knowledge_documents (language);

alter table knowledge_documents enable row level security;

create trigger knowledge_documents_set_updated_at
  before update on knowledge_documents
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Published knowledge is safety information intended for public
-- consumption, unlike `incidents` (which stays server-only/authenticated
-- per M02). Grant SELECT to anon + authenticated, but only for published
-- rows — draft/unpublished rows are never visible through RLS, matching
-- the M02 file's existing pattern of narrow, explicit policies with no
-- "allow everything" clause.
--
-- The M11 API route (GET /api/knowledge) uses the service-role client
-- (bypasses RLS, per existing project convention — see
-- app/api/incidents/route.ts) and additionally filters `published = true`
-- in the query itself, so unpublished rows are never returned through
-- the public endpoint even though the service role could otherwise see
-- them. This RLS policy is defense-in-depth for any future direct/anon
-- access path, not the sole safeguard.
-- ---------------------------------------------------------------------------

create policy "public_read_published_knowledge_documents"
  on knowledge_documents for select
  to anon, authenticated
  using (published = true);

-- No insert/update/delete policies for anon/authenticated. Seed data
-- below is inserted directly by this migration; future authoring goes
-- through server-side code using the service-role client, consistent
-- with how `incidents` writes work.

-- ---------------------------------------------------------------------------
-- Seed data — curated disaster/emergency knowledge (English)
--
-- Idempotent via ON CONFLICT (slug) DO NOTHING, so re-running this
-- migration (or a future `supabase db push` that replays it) never
-- creates duplicates.
-- ---------------------------------------------------------------------------

insert into knowledge_documents (title, slug, category, summary, content, source, language, published)
values
  (
    'What to Do During a Flood',
    'flood-immediate-response',
    'flood',
    'Immediate safety steps when floodwater is rising near you or your home.',
    'Move to higher ground immediately if water is rising. Avoid walking or driving through moving water — as little as 15cm (6 inches) can knock an adult over, and 30cm (1 foot) can float a car. Stay away from downed power lines and electrical equipment. If you are trapped in a building, move to the highest level, but avoid closed attics where you could become trapped by rising water — only go to the roof if necessary, and try to signal for help. Listen to local authorities for evacuation orders and follow them promptly. This information is general safety guidance and does not replace instructions from local emergency services.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Flood Evacuation Basics',
    'flood-evacuation-basics',
    'flood',
    'Key steps for evacuating safely ahead of or during flooding.',
    'If authorities issue an evacuation order, leave promptly rather than waiting to see how the situation develops. Before leaving, if time allows: turn off utilities (electricity, gas, water) at the main switches or valves if it is safe to do so, and move valuables and important documents to a higher floor. Take only main roads and follow official evacuation routes — floodwater can hide washed-out roads, sinkholes, and debris. Do not attempt to drive or walk through flooded roads even if they look shallow. Keep a small emergency bag ready in advance with identification documents, medication, water, and a phone charger or power bank.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Safe Drinking Water After a Flood',
    'flood-safe-drinking-water',
    'flood',
    'How to reduce the risk of contaminated water after flooding.',
    'Floodwater can contaminate wells, pipes, and stored water with sewage, chemicals, or debris. Do not drink tap water in a flood-affected area until local authorities confirm it is safe, even if it looks and smells normal. If safe bottled water is not available, water can be made safer by boiling it at a rolling boil for at least one minute (three minutes at higher altitudes), or by using water-purification tablets according to their instructions. Avoid using floodwater for drinking, cooking, brushing teeth, or washing food. Discard any food, including canned goods, that has come into direct contact with floodwater.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Flood Electrical Hazards',
    'flood-electrical-hazards',
    'flood',
    'Why electricity and floodwater are a dangerous combination, and how to reduce risk.',
    'Water conducts electricity, and floodwater in or around a building can energize surfaces, standing water, and metal objects without any visible warning. Do not enter a flooded basement or room if there is any chance electrical outlets, wiring, or appliances are submerged or wet. Do not touch electrical panels, switches, or appliances while standing in water. If it is safe to reach the main breaker without stepping in water, turn off power to the affected area; otherwise wait for a qualified professional or utility worker. Treat any downed power line near floodwater as live and stay well away from it, and report it to local authorities.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Immediate Earthquake Safety',
    'earthquake-immediate-safety',
    'earthquake',
    'What to do in the first moments of shaking.',
    'During shaking, the safest general guidance is Drop, Cover, and Hold On: drop to your hands and knees where you are, take cover under sturdy furniture or protect your head and neck with your arms if none is available, and hold on until the shaking stops. Stay indoors if you are already inside — most injuries occur from falling objects while people are moving through a building or trying to exit during shaking. If you are outdoors, move to an open area away from buildings, trees, and power lines. If you are driving, pull over away from bridges, overpasses, and power lines, and stay in the vehicle until shaking stops.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Drop, Cover, and Hold On — Why It Works',
    'earthquake-drop-cover-hold-on',
    'earthquake',
    'The reasoning behind the standard earthquake response technique.',
    'Drop, Cover, and Hold On is recommended by disaster-safety organizations worldwide because most earthquake injuries come from falling or flying objects, not from buildings collapsing outright. Dropping low prevents shaking from knocking you down. Taking cover under sturdy furniture (or against an interior wall, protecting your head and neck, if no furniture is available) reduces exposure to falling debris. Holding on keeps you connected to your shelter if it shifts during shaking. Trying to run outside during shaking is generally more dangerous than staying put, because falling debris close to buildings is a major hazard during the first seconds of an earthquake.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Post-Earthquake Building Safety',
    'earthquake-post-building-safety',
    'earthquake',
    'What to check before re-entering or staying in a building after an earthquake.',
    'After shaking stops, check yourself and people near you for injuries before checking surroundings. If you smell gas, see visible structural damage such as large cracks or leaning walls, or the building otherwise feels unsafe, leave immediately and do not use elevators. Do not re-enter a damaged building until it has been inspected and declared safe by a qualified authority. Be prepared for aftershocks, which can cause further damage to already-weakened structures. If you are trapped, avoid unnecessary movement that could stir up dust, cover your mouth with a cloth if possible, and tap on a pipe or wall to signal your location rather than shouting, to conserve energy.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Aftershock Precautions',
    'earthquake-aftershock-precautions',
    'earthquake',
    'Staying safe in the hours and days after a major earthquake.',
    'Aftershocks can occur minutes, hours, or even days after a main earthquake, and can be strong enough to cause additional damage to structures already weakened by the initial shaking. Keep shoes and a flashlight near your bed in the days following a significant earthquake. Avoid entering damaged buildings even briefly. If you must be indoors, know your nearest safe spots (sturdy furniture, interior walls) in case shaking resumes. Keep emergency supplies (water, food, medication, documents) accessible rather than packed away, in case you need to leave again quickly.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Immediate Fire Response',
    'fire-immediate-response',
    'fire',
    'The first actions to take when a fire starts or is discovered.',
    'If you discover a fire, alert others immediately and evacuate — do not stop to gather belongings. Get low if there is smoke, since air near the floor is cooler and less contaminated. Feel doors before opening them: if a door is warm, do not open it and use another exit route. Once outside, go to a designated meeting point and stay there so everyone can be accounted for. Call emergency services as soon as you are safely away from the fire; do not go back inside for any reason, including for pets or belongings.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Smoke Safety',
    'fire-smoke-safety',
    'fire',
    'Why smoke is often more dangerous than flames, and how to reduce exposure.',
    'Smoke inhalation is a leading cause of fire-related death, often more dangerous than the flames themselves, because smoke can disorient a person and cause loss of consciousness before they are aware of the danger. If you are caught in smoke, stay as low as possible while moving toward an exit, since smoke and heat rise. Cover your nose and mouth with a cloth if available to filter some particles, but do not delay evacuation to search for one. If you cannot escape a smoke-filled room, seal gaps under doors with cloth if possible and signal for help from a window rather than opening it, since fresh air can intensify a fire on the other side of a door.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Fire Evacuation Basics',
    'fire-evacuation-basics',
    'fire',
    'Planning and executing a safe fire evacuation.',
    'Know at least two exit routes from any building you spend significant time in, and identify a meeting point outside, a safe distance away, in advance. During an evacuation, move quickly but do not run in a way that could cause falls or blockages at exits. Do not use elevators during a fire, since they can fail or open onto a burning floor. Close doors behind you as you leave rooms, without locking them, to help slow the spread of fire and smoke. Once outside and at the meeting point, stay there and let emergency responders know if anyone is missing rather than re-entering yourself.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Fire Extinguisher Awareness',
    'fire-extinguisher-awareness',
    'fire',
    'When it is appropriate to use a fire extinguisher, and when it is not.',
    'A fire extinguisher can be appropriate only for a small, contained fire in its very early stages, when you have a clear escape route behind you and the extinguisher is rated for that type of fire (for example, not using a water-based extinguisher on an electrical or grease fire). The common technique is remembered as PASS: Pull the safety pin, Aim at the base of the fire, Squeeze the handle, and Sweep side to side. If the fire is spreading, produces heavy smoke, or you are unsure it can be controlled, evacuate immediately instead of attempting to fight it — no property is worth risking your life.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Collapse-Zone Safety',
    'building-collapse-zone-safety',
    'building_collapse',
    'Recognizing and staying clear of unstable structures after a collapse event.',
    'After a partial or full building collapse, treat the surrounding area as unstable even if it looks calm. Leaning walls, visible large cracks, exposed structural beams, or debris still settling are all signs the area may not be safe. Keep a clear distance from the structure unless you are a trained responder equipped for the situation, since further collapse, falling debris, or gas leaks can occur without warning. Do not smoke or use open flames near a collapsed structure due to the risk of gas leaks. Report the location and any known trapped individuals to emergency services rather than approaching alone.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Do Not Enter Unstable Structures',
    'building-collapse-do-not-enter',
    'building_collapse',
    'Why untrained entry into a damaged building is dangerous, even to help others.',
    'It can be instinctive to want to enter a damaged or partially collapsed building to search for or help trapped people, but doing so without training, equipment, and structural assessment significantly increases the risk of becoming a second casualty and can complicate rescue efforts. Search and rescue in collapsed structures requires specialized training to recognize secondary collapse risks, use shoring, and communicate safely with anyone inside. If you believe someone is trapped, stay at a safe distance, note what you can see or hear, and relay that information immediately to emergency responders.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Emergency First-Response Principles',
    'medical-first-response-principles',
    'medical_emergency',
    'General, non-diagnostic principles for responding to a medical emergency.',
    'This guidance is general safety information, not medical advice, and does not replace professional emergency medical services. If someone is seriously injured or unresponsive, call emergency services immediately. Do not move an injured person unless they are in immediate danger (for example, from fire or traffic), since movement can worsen certain injuries, particularly to the head, neck, or spine. If a person is conscious, try to keep them calm and still while waiting for help, and note visible symptoms or circumstances to relay to responders. If you are not trained in first aid, prioritize getting professional help quickly over attempting treatment yourself.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'When to Seek Urgent Medical Assistance',
    'medical-when-to-seek-urgent-care',
    'medical_emergency',
    'General signs that a situation needs urgent professional medical attention.',
    'This is general safety information, not a medical diagnosis. Seek urgent professional medical help immediately for signs such as: severe or uncontrolled bleeding, difficulty breathing, loss of consciousness, severe chest pain, signs of a stroke, or a serious injury from a fall, collapse, or accident. When in doubt, treat the situation as urgent and contact emergency services rather than waiting to see if symptoms improve. Provide responders with as much accurate information as possible — what happened, when, and any changes in the person''s condition — to help them prepare.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Reporting a Missing Person: Initial Steps',
    'missing-person-initial-reporting',
    'missing_person',
    'What information helps responders when reporting someone missing during a disaster.',
    'When reporting a missing person during a disaster, provide as much specific detail as possible: full name, age, physical description, what they were last wearing, the last known location and time they were seen, and any medical conditions or mobility limitations that might affect their ability to move to safety. Mention any location they may have tried to reach, such as a relative''s home or a known shelter point. Provide a working contact number where responders can reach you. Avoid searching in dangerous areas (such as unstable structures or floodwater) yourself — relay the information to coordinators or emergency services instead.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Information Useful for Missing-Person Responders',
    'missing-person-info-for-responders',
    'missing_person',
    'Additional details that make a missing-person report more actionable.',
    'Beyond basic identifying details, responders benefit from knowing: whether the missing person had a phone and whether it was reachable, any social-media or location-sharing activity, nearby landmarks close to their last known location, and whether they were with anyone else. If the person has a chronic medical condition, note it clearly, since this can affect search urgency. Update the coordinator or emergency services promptly if the person is found or new information becomes available, so search efforts are not wasted.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Road Blockage Safety',
    'road-blockage-safety',
    'road_blockage',
    'Staying safe when a road is blocked or damaged during a disaster.',
    'Treat a blocked or damaged road as a hazard, not just an inconvenience — blockages during disasters can involve downed power lines, unstable debris, floodwater, or structurally compromised ground. Do not attempt to move large debris or drive around barriers set up by authorities. If a detour is not clearly marked, wait for official guidance rather than attempting an unfamiliar route, particularly at night or in poor visibility. Report blocked roads to local authorities so they can be prioritized for clearance or marked for other travelers.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Avoiding Dangerous Routes',
    'road-blockage-avoiding-dangerous-routes',
    'road_blockage',
    'How to judge whether an alternate route is safe to attempt during a disaster.',
    'When a primary route is blocked, an alternate route is not automatically safer — it may cross floodwater, unstable ground, or areas without cell coverage. Prefer routes confirmed as open by local authorities or official disaster updates over routes suggested informally. Avoid traveling through areas with visible standing water, since depth and road conditions underneath can be impossible to judge from a vehicle. If you must travel through an area with uncertain conditions, let someone know your planned route and expected arrival time in advance.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Basic Emergency Shelter Considerations',
    'shelter-basic-considerations',
    'shelter_need',
    'What to prioritize when finding or setting up emergency shelter.',
    'When seeking emergency shelter, prioritize locations away from immediate hazards: away from floodwater and low-lying ground, away from unstable or damaged structures, and away from downed power lines. Official shelters set up by local authorities or aid organizations are generally preferable to improvised shelter, since they can provide access to food, water, and medical support. If sheltering in place is safer than moving, secure access to clean water, and identify the most structurally sound room in the building, away from windows. Keep vulnerable individuals — children, elderly people, and those with mobility or medical needs — prioritized for the safest available space.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Coping with Food Shortage During a Disaster',
    'food-shortage-coping-basics',
    'food_shortage',
    'General guidance on managing limited food supplies safely during a disaster.',
    'If food supplies are limited during a disaster, prioritize perishable items first before they spoil, and ration non-perishable food to last until resupply is realistic rather than consuming it quickly. Report food shortages to local authorities or aid organizations so the affected area can be prioritized for distribution. Avoid eating food that has been exposed to floodwater, extended power outages (for refrigerated/frozen items), or visible contamination, even if discarding it feels wasteful — foodborne illness during a disaster can be serious when medical care is also harder to reach. If infants, elderly people, or those with medical conditions are present, prioritize any specialized food or formula they need over general supplies.',
    'General emergency preparedness guidance',
    'English',
    true
  ),
  (
    'Emergency Preparedness Checklist',
    'general-emergency-preparedness-checklist',
    'general',
    'A general checklist for being better prepared before a disaster occurs.',
    'A basic emergency kit should include: drinking water, non-perishable food, a flashlight with extra batteries or a power bank, a first-aid kit, copies of important documents (identification, medical information), any regularly needed medication, and a portable phone charger. Agree on a communication and meeting plan with family members in advance, including an out-of-area contact in case local networks are down. Know the evacuation routes and emergency shelter locations for your area if they are published by local authorities. Review and refresh emergency supplies periodically, since food, water, and batteries can expire or lose charge over time.',
    'General emergency preparedness guidance',
    'English',
    true
  )
on conflict (slug) do nothing;
