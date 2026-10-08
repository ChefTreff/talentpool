-- 00NN · Wiki: englische Entwürfe aller deutschen Artikel (ADM-103 c)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1): „Alle Artikel in DE und EN — alle übersetzen.“ Im Bestand (08.10.): 32 deutsche
-- Artikel, kein einziger englischer. Plan (08.10.): Übersetzung als eigener Schritt, **als Entwurf**, Konrad prüft und veröffentlicht je Artikel.
--
-- * Je deutschem Artikel ohne Edition entsteht **eine englische Zeile als Entwurf** (`status = 'draft'`) mit denselben gemeinsamen Feldern
--   (Zielgruppe, Rollen, Phase, Thema, Produktbezug, Gültig bis, Sortierung, Verantwortliche Person). Ein archivierter deutscher Artikel bekommt
--   eine **archivierte** englische Fassung, damit er nicht über die englische Seite wieder auftaucht.
-- * **Nichts geht ungeprüft live:** `kb_articles()` liefert nur veröffentlichte Zeilen; solange die englische Fassung Entwurf ist, sehen
--   englischsprachige Leser weiter die deutsche. Veröffentlicht wird je Artikel im Admin (Wiki → Artikel öffnen → Englisch → Veröffentlichen).
-- * Übersetzt wurde mit Bezug auf die Begriffe des Portals (Messeshop = trade fair shop, Rückwand = backdrop, Eure Formate = Your formats,
--   Aufgabenliste = task list); Querverweise („siehe …“) nennen die **englischen Titel** der anderen Artikel. Adressen, E-Mail-Adressen und
--   Zahlen sind unverändert; Uhrzeiten stehen im 12-Stunden-Format.
-- * Idempotent: eine bereits vorhandene englische Fassung (gleicher Slug, gleiche Edition) bleibt unberührt (`on conflict do nothing`).
-- * Das Protokoll bekommt **einen** Eintrag `kb.en_drafts_seeded` mit der Zahl der angelegten Entwürfe.
-- Fehlerschlüssel: keine (Datenmigration).
set search_path = public, extensions;

do $mig$
declare v_n integer;
begin
  with neu as (
    insert into kb_article (slug, edition_id, language, audience, roles, phase, title, body_md, status, valid_until,
                            owner_person_id, sort_order, category, product_formats)
    select d.slug, d.edition_id, 'en', d.audience, d.roles, d.phase, v.title, v.body,
           case when d.status = 'archived' then 'archived' else 'draft' end,
           d.valid_until, d.owner_person_id, d.sort_order, d.category, d.product_formats
      from kb_article d
      join (values
  ($kb$ai-hackathon-wiki$kb$, $kb$AI Hackathon: Overview$kb$, $kb$> **Not final for 2027:** location and address for 2027; number of participants and number of challenges; application deadline and sign-up link; deadline for the pitch slides. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find the overview of the AI Hackathon. If anything is unclear, please get in touch – your contact persons are listed with their contact details in your portal.

## At a glance

- **Date:** 15 and 16 April 2027, right before the Summit
- **Place:** The location for 2027 has not been decided yet; it will be announced here and in your portal.
- **Participants:** several hundred tech talents
- **Format:** 24-hour hack on challenges set by companies
- **Language:** English (mixed German- and English-speaking participants)
- **Challenges:** several parallel challenges with about six teams each

## Sign-up

- **Application deadline:** The deadline for 2027 will appear here and in the portal as soon as it is set.
- **Cost:** free; meals and a place to sleep are provided
- **Team mode:** sign up alone or as a team; solo participants are assigned to teams on site

Who exactly belongs to the target group is described under “Who Takes Part in the Hackathon”.

## Deadline for the challenge

The **challenge description must be ready by 18 March 2027, 11:59 pm** – four weeks before the hackathon. You maintain it yourselves in the Partner Portal; the deadline also appears in your task list there, with a reminder.

What matters in terms of content is described under “What Makes a Good Hackathon Challenge”.

## Schedule

You will find the hour-by-hour schedule under “AI Hackathon: Schedule”.

Roughly: **Day 1** begins in the morning with check-in and breakfast, followed by the welcome, team building, your introduction in the auditorium and the onboarding in the challenges. From midday on, teams work, with breaks for lunch and dinner and an open end into the night. **Day 2** starts with team work and breakfast, followed by finalisation, pitches, the jury decision, the award ceremony and networking until early afternoon.

## For challenge partners

The details of your tasks are in separate articles:

- **Writing the challenge:** “What Makes a Good Hackathon Challenge”
- **Introduction on the first morning:** “Your Introduction on the First Morning”
- **Mentors and jury:** “Mentors and Jury”
- **Prizes:** “Prizes for the Winning Teams”
- **Branding your area:** “The Backdrop of Your Challenge Area”
- **Who takes part:** “Who Takes Part in the Hackathon”

## Speed dating

In speed dating, partner companies hold relaxed, non-binding conversations of about 15 minutes with participants. If you are interested, get in touch with your contact person – you can add a booking link for the time slot you want.

## Partner pitches

At the start, you present your company and your challenge in the auditorium. The deadline for slides and information is in your task list in the portal.

## Location and logistics

- Address and directions for 2027 will appear here as soon as the location is fixed.
- **Overnight stay and quiet zones:** places to sleep are available on site.
- **Catering:** breakfast, lunch and dinner on day 1, breakfast and lunch on day 2. Plus snacks during the night.$kb$),
  ($kb$anlieferung-aufbau$kb$, $kb$Delivery (Car), Advance Shipping & Setup$kb$, $kb$> **Not final for 2027:** binding setup and delivery times; the venue's logistics provider and their contact person; recipient address and shipping label for advance shipments; hall designation. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

This information is for planning the delivery of smaller materials – that is, everything you bring yourselves in boxes by car or want to send to the CCH in advance, for example merch. Everything about delivering your own exhibition booths or larger structures by van or truck is under “Delivery (Truck) by Service Provider”.

## Addresses and access

- **Congress Center Hamburg (CCH):**
  Congressplatz 1, 20355 Hamburg
  (right at Dammtor station, next to Planten un Blomen)

- **Delivery for trucks and vans – Entrance B:**
  Tiergartenstraße 2, 20355 Hamburg
  Access via Renzelstraße/Karolinenstraße

- **Car delivery and small quantities:**
  Car park at the Radisson Blu, access via Dammtorstraße
  Access by lift directly into the congress building

## Sending parcels to the venue in advance

**Important:** Direct deliveries to the CCH are not possible. Advance deliveries must be registered and handled through the venue's internal logistics provider.

Which provider that is in 2027, which recipient address applies and which internal shipping label you additionally need, we will add here as soon as it is fixed. Expect to need two labels: a standard shipping label from your carrier and an internal label for handling on the premises, showing the hall and **your booth number**. You will find your booth number under “Floor Plan & Booth Overview”.

## When can you deliver and set up?

**Wednesday, 14 April 2027 – external booth builders only**
- External booth builders can deliver and start building the booth.

**Thursday, 15 April 2027**
- During the day: booth construction by external booth builders
- From the afternoon: partners can move into and fit out their booths.

**Friday, 16 April 2027**
- Morning: stocking the booths and final delivery for all partners
- **Note:** Please deliver all materials in good time before doors open so that the Summit can start on time.

The binding times will be in the setup plan as soon as it is available.

## Storage during the event

- **At the booth:** Only what you need during the event may stay there.
- **Empties, large cardboard, packaging:** remove from the booth immediately (fire safety). Storage goes through the venue's logistics provider and must be registered.
- **Cloakroom:** There is a separate cloakroom for partners and speakers – you can leave jackets and backpacks there.

## Teardown

**Sunday, 18 April 2027** is teardown day for all partners, booth staff and external booth builders.

## Important notes on access

**Trucks and vans** (details under “Delivery (Truck) by Service Provider”):
- Access only via Tiergartenstraße (Entrance B)
- Deposit in cash on entry, refunded on exit
- Limited time in the loading zone
- Follow the instructions of the parking attendants and security staff

**Cars (small quantities):**
- Please use only the car park at the Radisson Blu
- Access by lift directly into the CCH
- No delivery of small quantities via Tiergartenstraße

## Car park: how delivery by car works

Delivering by car with just yourselves and a few boxes? Then drive via Dammtorstraße straight into the car park at the Radisson Blu. From there, the lifts take you and your materials directly to the entrance hall and to accreditation.

## Questions

- Please stick to the given time slots so the process works for everyone.
- If you have questions or special requirements, get in touch early with your contact person in the portal.
- Safety and logistics on site take priority – our team is happy to help.$kb$),
  ($kb$anlieferung-lkw$kb$, $kb$Delivery (Truck) by Service Provider$kb$, $kb$> **Not final for 2027:** deadline for the vehicle entry forms; registration form for logistics; logistics provider and contact person; amount of the deposit; internal contact person. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

This information is for planning the delivery and setup of larger structures and booths. Feel free to share it with service providers, such as a freight forwarder or external booth builder. You will find your internal contact person at ChefTreff with contact details in your Partner Portal.

## Scenarios: what do you need to do?

**You arrive by car and bring only small quantities (boxes, roll-ups) or want to send something to the venue in advance?**
→ See “Delivery (Car), Advance Shipping & Setup”.

**You arrive by van or truck or have large quantities and exhibits?**
- Access via Tiergartenstraße (Entrance B).
- Have the deposit ready in cash – we will state the amount here as soon as it is fixed.
- Registration via the logistics form. We will provide the link in your task list in the portal.
- Loading time is limited, please book a slot.

## Deadlines and responsibilities

| Task | Deadline | Responsible |
|---|---|---|
| Submission of vehicle entry forms (delivery and pick-up) | shown in the portal with your task | Exhibitor/partner |

The deadlines for 2027 have not been set yet. As soon as they are set, they will appear in your task list in the Partner Portal with a reminder – not only here in the wiki.

## Step by step: delivery by van and truck

1. **Register in advance:** Register all deliveries (vans, trucks, large quantities, exhibits) via the logistics form.
2. **Fill in and send the form:** Enter all details – exhibitor, contact person, logistics needs, shipment details – and send the form to our team on time. We forward your registration to the logistics provider.
3. **Confirmation and contact:** Once your registration is received, the logistics provider takes over further coordination and will contact you.
4. **On site:**
   - Access to the delivery zone via Tiergartenstraße (Entrance B).
   - Have the deposit ready in cash.
   - Unloading and storage are handled by the logistics provider.
   - Loading time is limited, please keep to your assigned slot.

## Storage during the event

- **At the booth:** Only what you need during the event may stay there.
- **Empties, large cardboard, packaging:** remove from the booth immediately (fire safety). Storage through the logistics provider, registration required.

## FAQ and tips

- **Deposit for trucks and vans:** in cash, please have the exact amount ready.
- **Empties and packaging:** for fire safety reasons, have them removed from the booth immediately.
- **Storage space:** Only what is needed at the booth may stay there. Store everything else through the logistics provider.
- **Questions?** Get in touch early with your contact person.

All logistics processes and deadlines are binding and must be observed so that the process works for everyone.$kb$),
  ($kb$company-tours$kb$, $kb$Company Tours$kb$, $kb$> **Not final for 2027:** start times of the 2027 tours; group size; date for submitting the tour information. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find all the information about the Company Tours. They take place on **Thursday, 15 April 2027**, the day before the Summit. The meeting point is the CCH, Congressplatz 1, 20355 Hamburg.

## How long is a slot?

Each slot is 75 minutes net plus 15 minutes for arriving and setting off. A slot therefore usually takes 90 minutes.

## When does our tour start?

You will find the timetable of all tours with your times in your Partner Portal under “Your formats” as soon as planning is done. In general, tours start in the morning; a tour is usually on the road for about six hours.

## Your tour lead

Each tour is accompanied by a **tour lead** – a person from our team who takes the group from station to station. You will find the name, photo, email and phone number of your tour lead in the Partner Portal under your Company Tour.

## How many people take part?

Each tour has around 45 to 55 talents. If you have restrictions – for example due to room sizes – that require a smaller group, please let us know beforehand.

## Snacks, drinks and goodies

Participants are on the road for almost eight hours in total. We therefore recommend that you – where possible – provide a few drinks and snacks. That keeps participants focused and in a good mood.

If you would like to hand out goodies, that is welcome but not required.

## How are participants selected? Do we receive the data?

We select participants in an application process and take your preferences from the profile into account. Please be sure to share them with us. Since we visit several companies, you cannot select participants yourselves – the more precisely you describe who you would like to have, the better we can take it into account.

You receive the data of all participants and may contact them **once after the tour**. You get the participant list a few days before the tour.

## We have to register all guests – how do we handle that?

All participants receive a name badge from us. If you additionally need to register people individually, it is best to do so in advance based on the participant list, so that it takes as little time as possible on site.

## Photographers and videographers

Some tours are accompanied by our photo and video team. If photo or video recording is not allowed at your site, please state this in the onboarding.

## Where do we send the information about the tour?

You maintain the information about your Company Tour yourselves in the Partner Portal under “Your formats”. For questions and coordination, get in touch with your contact person – they are listed with contact details in your portal.$kb$),
  ($kb$eigenbau-stand-genehmigung$kb$, $kb$Custom-Built Booth: Approval$kb$, $kb$> **Not final for 2027:** upload the application template for 2027; submission deadline; recipient address for the application. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Do you want to have a custom booth built or build it yourselves? Then you need approval from the CCH. To make sure everything runs smoothly, answer the following questions and submit all documents in good time.

## Template for submission

We will provide the application template for 2027 here and in your task list in the Partner Portal. Fill it in and send it to your contact person with the subject “Approval request: custom booth construction”. Your contact person is listed with contact details in your portal.

## What information do we need?

- **Who are you?**
  Name, company, booth number and contact details.
- **What does your booth look like?**
  Size, build height, construction method, materials and design. Are there special fittings or exhibits?
- **Do you have technical documents?**
  Floor plan, elevations, 3D visualisations and photos where applicable. For multi-storey or special constructions: do not forget the structural calculation.
- **When do you build up and take down?**
  Planned periods for setup and teardown. Who does the setup – you yourselves or a service provider?
- **Are all regulations met?**
  Pay attention to fire safety, technical supply and the Hamburg regulation on places of assembly.
  → [CCH technical guidelines](https://www.cch.de/fileadmin/general/pdf/guidelines/hmc_technische_richtlinien_aktuell_de.pdf)
  → [Hamburg regulation on places of assembly](https://www.landesrecht-hamburg.de/bsha/document/jlr-VSt%C3%A4ttVHAV1P1)
- **Are there any special features?**
  Lasers, pyrotechnics, vehicles, containers or the use of music must be registered and approved separately.

## What happens after submission?

- Your documents are reviewed by the CCH and, where applicable, external bodies.
- If documents are missing or late, the review cannot be completed in time – changes or even booth closures are then possible.
- You bear the costs of the approval procedure as the applicant.

**Tip:** Submit your application as early as possible and ask us directly if you are unsure. That way you make sure your booth is approved in time.$kb$),
  ($kb$event-app$kb$, $kb$Event App (Swapcard)$kb$, $kb$> **Not final for 2027:** date for the data upload; go-live date of the app; link to the event in the app. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

We use Swapcard as the event app. Here you will find instructions for setting up the app and your profile.

## Schedule for the app

The app goes live a few weeks before the Summit. You will find the date for the data upload and the go-live in your task list in the portal as soon as it is set.

By go-live, the following should be in place:

- your personal profiles
- the exhibitor or partner profile
- your meeting slots
- open job positions
- further product offers

## Lead scanning: an important setting in the team

For leads to really be shared with everyone, every team member has to change one setting. Go to **Team members** – there you see your profile on the right. Switch on the field **My contacts**. That way all leads are shared with the team and can be exported at the end.

The easiest way is to add people to the app only via the Partner Portal – then this setting is already done.

You will find the detailed instructions for lead capture in the [Swapcard help](https://help-attendees.swapcard.com/en/articles/8185513-how-to-use-lead-capture-to-collect-and-process-leads).

## What happens in the app?

- Lead scanning
- Display and personalisation of the agenda
- Applying for and admission to Masterclasses
- Booking meetings at meeting points in the hall
- Interaction with participants$kb$),
  ($kb$faq-speaking$kb$, $kb$FAQ: Speaking at the Summit$kb$, $kb$> **Not final for 2027:** link to the 2027 programme; link to the event in the app; deadline for the slides. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Everything about the programme and general information on speaking at the FUTURE LEADER SUMMIT 2027.

## Where can I find the programme?

The programme is published step by step on our website and in the event app. You will find the link here and in your Speaker Portal as soon as the programme is online.

## Can I change the title of my keynote?

Yes. You can change the title yourself in your Speaker Portal under your appearance while the deadline is running. After that, please get in touch at speaker@chef-treff.de.

## When is my slot?

You will find your slot in your Speaker Portal, in the event app and in the programme on our website. If you have questions, contact your speaker buddy – name and contact details are in your portal – or write to speaker@chef-treff.de.

## When should I be there?

Please be at the venue 30 to 60 minutes before your appearance at the latest. Five to ten minutes before you go on, you will be fitted with a microphone at your stage.

## Where do I check in?

We have a separate speaker accreditation right at the entrance. You can report there and we will pick you up. If you need anything on site, you can reach your team through the contact details in your Speaker Portal.

## What technology is provided?

You get a clicker and a microphone – a handheld microphone or a headset, depending on the stage.

## Can I bring slides?

Yes. We need them a few days before the event; the exact deadline is shown with your task in the Speaker Portal. Use your slides as a supporting element, for example with photos or key learnings. Slides with a lot of text or self-promotion are not welcome with us. Everything else is under “Presentations”.

## Is there a speaker lounge?

Yes, there is a separate area for speakers. We will show it to you on arrival. You can leave your things there and retreat.

## Is there food on site?

Yes, free catering for speakers is available in the speaker lounge.$kb$),
  ($kb$hackathon-ablauf-teilnehmende$kb$, $kb$AI Hackathon: Schedule$kb$, $kb$> **Not final for 2027:** location and rooms for 2027; binding times; side formats such as meet-ups. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here is the schedule for participants at the AI Hackathon. **Date: Thursday, 15 April 2027 to Friday, 16 April 2027.** We will announce the location for 2027 here and in the portal as soon as it is fixed.

The times below are the planned rhythm; we will provide the binding timetable shortly before the event.

## Day 1 – Thursday, 15 April 2027

- **08:30** – Check-in: arrive, brief exchange, find a place
- **09:00** – Welcome moderation and **breakfast**: welcome by ChefTreff
- **09:30** – Team building
- **10:00** – Challenge partner presentations, three to four minutes per partner
- **10:30** – Welcome by the venue
- **11:00** – Tech partner onboarding
- **11:30** – Challenge onboarding: teams meet the challenge setters, clarify details and framework
- **12:00** – Team work
- **13:00** – Break and **lunch**
- **14:00** – Team work and speed dating
- **16:00** – Meet-up slot
- **18:00** – Break and **dinner**
- **18:30** – Team work, open end
- **22:00** – Snacks

## Day 2 – Friday, 16 April 2027

- **09:00** – Team work, speed dating and **breakfast**
- **10:00** – Finalise results
- **10:30** – Pitches, about 90 seconds per team, with snacks
- **12:30** – Jury decision
- **13:00** – Award ceremony, closing moderation and **lunch**
- **13:30** – Networking and official end

**Tip for participants:** Plan sleep or rest times for the night. Meals and places to sleep are organised on site.

After the hackathon, the FUTURE LEADER SUMMIT starts at the CCH – your ticket is valid for both days.$kb$),
  ($kb$hackathon-challenge-definieren$kb$, $kb$What Makes a Good Hackathon Challenge$kb$, $kb$Your challenge is the task the teams work on for 24 hours. It decides
whether something comes out at the end that is useful to you.

## Two approaches that work

**Option A, our recommendation: a product or an application.** The teams build something
you can look at and use, with an AI solution inside.

**Option B: an optimisation task.** You bring a dataset, and the goal is the best
predictive performance.

## What your challenge should meet

- It leaves room for creative solutions instead of prescribing a particular one.
- Technically, it is a challenge that can be solved with AI in the broader sense —
  classification, forecasting, language processing.
- It has a product or design component: an app, a website, a dashboard, an
  automation.
- It is **solvable in 24 to 30 hours**.
- Where data is needed, it is really available — public or provided by you, for example
  as CSV, JSON or through an interface.
- At least one person from your company accompanies the event as a mentor.

## What we need from you

1. A **clear framework**: the problem statement, the context, the background.
2. A **specific goal** that fits realistically into your context.
3. Optionally a **dataset**.
4. A **short briefing** in the portal and a briefing call of about 30 minutes.

Come with a clear problem statement. If you have data, bring it — above all, the context
matters. The challenge should be specific and still allow creativity.

You submit your challenge in the portal under **Hackathon**. After that, we review it and
present it to the teams.$kb$),
  ($kb$hackathon-mentoren-jury$kb$, $kb$Mentors and Jury$kb$, $kb$Your people on site are the difference between a task on paper and a team
that knows what matters.

## How many

We recommend **one to five people** per challenge partner.

## Who fits

People from IT, machine learning, AI, data science or software development. If you also bring
someone from HR or People, it pays off for the conversations with the participants.

## What we expect

As much time with the teams as possible. We do not expect an overnight stay — the teams
partly work through the night, your mentors do not have to.

## Jury

At the final presentations, your mentors can act as a jury and rate the
teams of your challenge. Scoring runs through the hackathon app; you set the criteria and
their weighting yourselves when you submit your challenge.$kb$),
  ($kb$hackathon-pitch-vorstellung$kb$, $kb$Your Introduction on the First Morning$kb$, $kb$At the start, you present your company and your challenge in the auditorium. After that, the
participants decide which challenge they work on.

- **Time frame:** about three to four minutes.
- **Length:** about four slides, this is not a hard limit.
- **Afterwards:** an onboarding of 15 to 30 minutes for the teams that have
  chosen your challenge. That is where the details come in.

We will tell you the deadline for your slides in good time; it is a few days before the hackathon
so that the technical team can prepare everything.$kb$),
  ($kb$hackathon-preise$kb$, $kb$Prizes for the Winning Teams$kb$, $kb$What you offer is up to you. From past years we know what goes down well.

- **Intangibles often work best:** a visit to you, a factory tour, an
  invitation to headquarters.
- **Covering travel costs** or providing a budget for them.
- **Material prizes.**
- **Access to software or credit** with your services.

What you offer, you enter together with your challenge in the portal. The teams see it
before they decide on a challenge — a good prize brings you the better teams.$kb$),
  ($kb$hackathon-rueckwand$kb$, $kb$The Backdrop of Your Challenge Area$kb$, $kb$You can brand the surface of your challenge area. For this, we apply film to the window panes behind
the area.

## Graphic requirements

- **Safety margin:** text, logos and faces at least **100 mm** from the visible edge.
- **File format:** PDF/X-4.
- **Colour space:** CMYK (ISO Coated v2).
- **Resolution:** at least 62 dpi at final size.
- **Fonts:** embedded or converted to outlines.
- **Safe zone:** 100 mm inwards, **not** included in the bleed.
- **Final size:** **1610 × 2790 mm** (width × height) — the visible frame.
- **Data format:** final size plus bleed.

You can upload your file in the portal under **Hackathon**; the deadline is shown there as well.$kb$),
  ($kb$hackathon-teilnehmende$kb$, $kb$Who Takes Part in the Hackathon$kb$, $kb$## Target group

Tech talents from software engineering, data science, mathematics and physics, UI/UX,
engineering, computer science and business informatics — students, young
professionals and career changers.

## Size

In past years there were a few hundred participants, divided among several
challenges with about six teams each.

## Language

**English.** Participants come from German- and English-speaking regions; your
challenge, your slides and your briefing should therefore be in English.

## Sign-up

Participation is free, and meals and a place to sleep are provided. People sign up
alone or as a team; anyone who comes alone is assigned to a team on site.$kb$),
  ($kb$hallenplan-standuebersicht$kb$, $kb$Floor Plan & Booth Overview$kb$, $kb$> **Not final for 2027:** upload the 2027 floor plan as a file; booth numbers and dimensions; confirm the equipment for each booth category. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

The floor plan shows you **where your booth is located in the room**, how the booths relate to each other and where central areas such as entrances, walkways or service areas are.

## Floor plan

You will find the 2027 floor plan as a file in your Partner Portal as soon as hall planning is complete.

**Are the booth assignments final?** No. The booth assignments are provisional and may still change in the course of further planning, for organisational or technical reasons.

## Booth numbers

**Your booth number is shown in your Partner Portal with your booth** – together with the booth size and the binding data formats for the backdrop. You will also find the complete exhibitor list in the portal.

## Booth equipment

Our all-inclusive booths come with basic equipment. You book additional elements and upgrades through the trade fair shop in the Partner Portal.

| Category | Equipment |
|---|---|
| Start-up / initiatives | 1 counter, 2 bar stools |
| Basic | Backdrop (printed fabric banner) incl. printing, 1 standing table, 2 bar stools, carpet, power connection (230 V), booth lighting, booth cleaning once before the first opening day |
| All In | Backdrop (printed fabric banner) incl. printing, 2 standing tables, 4 bar stools, carpet, power connection (230 V), booth lighting, booth cleaning once before the first opening day |
| Premium | Backdrop (printed fabric banner) incl. printing, 2 standing tables, 4 bar stools, 1 counter, carpet, power connection (230 V), booth lighting, booth cleaning once before the first opening day |

The exact booth sizes per category depend on the 2027 floor plan and are shown with your booth in the portal.

## Which information is most relevant for you?

As an exhibitor, the most important things for you are:

- **Booth number** – for orientation and communication
- **Booth size** – relevant for graphics, equipment and print files

You will find all dimensions for your backdrop under “Booth: Backdrop & Print Files”.$kb$),
  ($kb$help-desk-kiosk$kb$, $kb$On Site: Help Desk & Exhibitor Kiosk$kb$, $kb$> **Not final for 2027:** location of the kiosk on the 2027 floor plan; opening hours; loan conditions and deposit. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find information about the exhibitor kiosk and help desk at the event. During the event days, you get quick and uncomplicated help there with any questions.

## Location

We will add the exact location of the exhibitor kiosk here as soon as the 2027 floor plan is final – as in the previous year, it is close to the Masterclass area and signposted. We are there for you throughout setup, the event and teardown.

## What does the exhibitor kiosk offer?

**Questions and help:** Whether it is setup, logistics, finding your way around the hall or technical questions – there is always someone at the exhibitor kiosk for you. We help directly or point you to the right contact persons.

**Loan service:** You can borrow important tools at short notice, for example:

- Hand truck
- Pallet truck
- Tools
- Cables, tape and gaffer tape

Loans are limited in time and made against a deposit.

## Important notes for booth setup

- **Own responsibility:** Please make sure you bring all the materials and tools you need. The loan service is intended as an emergency solution.
- **Support in case of shortages:** If something is missing or running short after all, we will help without fuss – just come to the kiosk.

## Questions, requests or special concerns?

With the exhibitor kiosk, you have a central help desk that supports you throughout the entire Summit – for a smooth process, quick solutions and a relaxed trade fair experience. Drop by any time.$kb$),
  ($kb$hotel-unterkunft$kb$, $kb$Hotel Partnership & Accommodation$kb$, $kb$> **Not final for 2027:** hotel partner for 2027; room rates; booking code and booking link; cancellation terms. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

This year again, we enable our partners, speakers and guests to use discounted contingents in our partner hotel. Here you will find all the information about your booking options.

## Hotel partner

The partnership for 2027 has not been fixed yet. As soon as hotel, rates and booking code are agreed, you will find them here and in your task list in the portal.

Last year we agreed fixed rates at two Hamburg hotels, each including breakfast and with free cancellation shortly before arrival. Experience shows it pays to book early.

## Booking on your own

You are not tied to our partner hotel. The CCH is centrally located at Dammtor station; there are numerous hotels in all price ranges within walking distance. How to get to the CCH is described under “CCH: Location & Getting There”.$kb$),
  ($kb$location-anfahrt$kb$, $kb$CCH: Location & Getting There$kb$, $kb$> **Not final for 2027:** hall designation for 2027; car park rates. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

## Venue

The FUTURE LEADER SUMMIT takes place at the **CCH – Congress Center Hamburg**. The CCH is centrally located in Hamburg, right at Dammtor station and close to the Planten un Blomen park.

**Address:**
Congress Center Hamburg (CCH)
Congressplatz 1
20355 Hamburg

## Getting there by car

- The CCH is easy to reach via Hamburg's main arterial roads.
- **Parking:** There is a car park with over 800 spaces right at the CCH. Access is via Marseiller Straße.
- **Rates:** The current rates are listed by the car park operator; expect an hourly rate and a daily maximum.
- **Note for suppliers:** A separate loading yard is available for truck deliveries – see “Delivery (Truck) by Service Provider”.

## Getting there by public transport

- **Rail:** The CCH is right at Hamburg Dammtor station (long-distance rail, S-Bahn S11, S21, S31). From there it is about a two-minute walk to the main entrance.
- **Underground:** U1, Stephansplatz stop (about a five-minute walk).
- **Bus:** Numerous bus lines stop at Dammtor station or at Stephansplatz.
- **Timetable information:** Use the journey planner of the [HVV](https://www.hvv.de/).

## Directions map

You will find the directions image and the floor plan as a file in your portal as soon as they are available for 2027.$kb$),
  ($kb$masterclasses$kb$, $kb$Masterclasses$kb$, $kb$> **Not final for 2027:** number and location of the Masterclass rooms in 2027; date for the registration deadline. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find all the information about the Masterclasses: when and where they take place, how registration works and what technology is available on site.

## How long are the Masterclasses and what is the schedule?

The Masterclasses last **60 minutes**. That is your net time in the room, including any Q&A as well as setup and teardown. We are very strict about this so that everyone has the same time.

**Schedule on site:**

- **at the latest 60 minutes before the start:** ticket pick-up at the speaker counter
- **15 minutes before the start:** meet at the Masterclass area (signposted on site)
- **Slot start:** technical briefing in the room and final preparation
- **5 minutes after the slot start:** content begins
- **5 minutes before the slot ends:** content ends, teardown, leave the room

## Where do the Masterclasses take place?

In a separate area of the hall with numbered Masterclass rooms and a welcome area. You will find the exact room of your Masterclass in the programme and in the event app. Further information on the room plan is under “Floor Plan & Booth Overview”.

## What technology is available in the rooms?

We have projectors or screens and basic presentation technology such as a clicker in the rooms. You can connect your own laptops via HDMI or bring the presentation on a USB stick. Please bring suitable adapters yourselves – we do have some on site, but better safe than sorry.

## Special feature: Silent Masterclass Stages

To ensure the best possible acoustic experience and full focus on your content, all Masterclass rooms are set up as **silent stages**. Participants receive headphones, and you speak into a microphone. Interaction is possible through a second microphone.

## How should the Masterclass be designed?

As with the keynotes, the content should always come first. Put yourself in the target group's shoes: what is interesting for young people? Try to convey relevant knowledge and use your strengths in terms of content. “Today we are simulating a consulting project with you” works much better than “We are a consultancy and have the following business units”. Leave room for questions and make the Masterclass as interactive as possible.

## How does registration work?

Registration runs through an application process. There is a public call to which participants can register. We close registration some time before the event; you will find the exact date in your task list.

Afterwards, you see the applications in your Partner Portal under “Your formats” and can admit them according to your wishes. We send out the acceptances.

## What data do we receive and how may we use it?

You receive the list of applications and select the participants from it. You may contact both the registered people and the participants after the Masterclass **once** and, for example, draw their attention to your talent pool.

## Where do we send the information about the Masterclass?

You maintain the title, description and application questions of your Masterclass yourselves in the Partner Portal under “Your formats”. If you have questions, get in touch with your contact person – they are listed with contact details in your portal.

## What should titles and description texts look like?

Here are examples from previous years that worked well. Feel free to follow the structure. What always matters:

- What can participants concretely learn?
- What knowledge, skill or experience do you convey?
- What can participants expect?

**Example 1: How to use GenAI for business success – strategy, use cases and best practices**

> In this Masterclass you get a roadmap for successfully implementing generative AI in a business context. Strategies for selecting and implementing GenAI use cases in companies are presented, complemented by three concrete success stories from practice. We also share best practices, common mistakes and top tips so that you can use GenAI successfully in your company.

**Example 2: Master your Career – Lessons Learned from two female C-levels**

> How do you make it to the C-level? What challenges and opportunities are there on the career path? How can you actively shape your career? In this exclusive Masterclass, a Chief People Officer and a Chief Product Officer share their personal experiences and learnings. In a fireside chat, they talk about strategic career decisions, leadership and the importance of networks.

**Example 3: Next-Level Productivity – Mastering Automation Tools as Key Skill of the 21st Century**

> Automation is long past being a “nice to have” – it is one of the decisive future skills of our time. In this Masterclass you learn how to automate your own workflows with no-code tools, which processes in your studies, job or own projects you can automate right away, and why understanding automation is becoming a key competence in every industry. You do not need any programming knowledge – just curiosity.

**Example 4: How am I supposed to know what I want? A step-by-step guide**

> “Once I find what I am passionate about, I will get started and give it my all. But how am I supposed to know what I really want?” A question that surprisingly many ambitious, talented people ask themselves. This is exactly where this Masterclass comes in: you get a clear, field-tested step-by-step guide to recognising your deepest wishes and real goals – professionally and privately. You learn to discover hidden talents, track down limiting beliefs and make decisions that really suit you.$kb$),
  ($kb$media-kit$kb$, $kb$Media Kit$kb$, $kb$> **Not final for 2027:** figures for 2027 (speakers, guests); upload graphics, banners and teaser videos again; link to the image and logo storage. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find the most important texts and graphics to share your participation in the FUTURE LEADER SUMMIT with your network. You can adapt the texts to match your style. A graphic with your logo is available in your portal.

**We will provide the graphics, banners and teaser videos for 2027 here as soon as they are ready.** The previous year's files were in Notion and are no longer available.

## General description

> **About: FUTURE LEADER SUMMIT 2027**
>
> Germany faces major challenges: the economy is stagnating and is visibly losing ground in international comparison. What does that mean for us? Where do the hidden opportunities lie?
>
> On 16 and 17 April 2027, leading CEOs, founders, investors and scientists share their knowledge about **careers**, the **latest technology trends** and the most important **skills** for personal development – practical, authentic and at eye level.
>
> The FUTURE LEADER SUMMIT offers **talents**, **young leaders** and **start-ups** exclusive **industry insights**, inspiring **keynotes**, a **matchmaking app** for networking and a fantastic **afterparty**.
>
> Among the guests are outstanding personalities from business, politics and society – including renowned entrepreneurs, experienced executives, innovative founders, recognised finance experts as well as leading political representatives and other thought leaders of our time.
>
> This is your chance to **gather knowledge**, **make contacts** and **learn** from the best minds at eye level.

## Messenger (WhatsApp, Slack)

> **WE ARE IN! At the FUTURE LEADER SUMMIT 2027!**
>
> On 16 and 17 April 2027, the biggest talent event in Europe takes place in Hamburg – and you can be part of it.
>
> We, [YOUR NAME], are an official partner at the FUTURE LEADER SUMMIT 2027.
>
> Two days full of insights from business, science, tech and the founder scene await you. You can make valuable contacts and decisively advance your career.
>
> The programme is varied and practical: keynotes, Masterclasses, a large expo, matchmaking sessions, a startup pitch battle and an AI Hackathon offer inspiration and real access.
>
> **Hard facts:**
> - 16 and 17 April 2027 – CCH Hamburg
> - Website: https://chef-treff.de/

## Email and newsletter

> **Subject:** Exclusive invitation: FUTURE LEADER SUMMIT 2027
>
> Dear [Name],
>
> we are an official partner at the FUTURE LEADER SUMMIT 2027.
>
> On 16 and 17 April, the FUTURE LEADER SUMMIT in Hamburg brings together thousands of ambitious talents, young professionals and start-ups with top companies, CEOs, founders and investors.
>
> **What awaits you:**
> - **Practical insights and networking:** a two-day programme designed for ambitious talents, future leaders and innovative start-ups.
> - **Inspiration and further education:** insights and experiences of leading personalities from business, science and politics – in talks and interactive workshops.
> - **Encounters:** direct exchange with outstanding personalities.
>
> More information: https://chef-treff.de/

## LinkedIn: “We are in”

> **FUTURE LEADER SUMMIT 2027: Europe's largest platform for talent and innovation**
>
> On 16 and 17 April, the FUTURE LEADER SUMMIT in Hamburg brings together thousands of ambitious talents, young professionals and start-ups with top companies, CEOs, founders and investors.
>
> We are delighted to be part of it as a partner and to jointly empower the next generation of doers – with real insights, inspiration and networking at eye level.
>
> **What awaits you:**
> - Practical learnings and career impulses from international role models
> - Interactive Masterclasses and workshops on leadership, tech and future skills
> - Unique networking
>
> Do you want to be there when Europe's economy and career paths are being rethought? Experience inspiration, knowledge and real community at the FUTURE LEADER SUMMIT.

Please tag us with **@chef.treff**. Feel free to use this template and add your logo.

## LinkedIn: “Meet us”

> **Meet us at the FUTURE LEADER SUMMIT 2027**
>
> In just a few days it is time: we are at the FUTURE LEADER SUMMIT on 16 and 17 April in Hamburg.
>
> Together with thousands of talents, young professionals and innovative start-ups, we look forward to inspiring encounters, new impulses and real networking.
>
> Meet us on site – let us talk about career paths, leadership and the future of business and learn from each other.

You will find the template filled in with your logo in your Partner Portal.

## Voices from the media (articles in German)

- [NDR – ARD Mediathek: By 2035 around 133,000 skilled workers will be missing in Hamburg](https://www.ardmediathek.de/video/hamburg-journal/bis-2035-werden-in-hamburg-rund-133-000-fachkraefte-fehlen/ndr/Y3JpZDovL25kci5kZS81OWY5YjI5Yy02NTRjLTRlN2QtOTY1Ni0wNmU5NTExNDNlOGU)
- [Business Insider: Kliemann as a guest at the ChefTreff summit in Hamburg](https://www.businessinsider.de/gruenderszene/media/fynn-kliemann-ueberrascht-mit-erstem-auftritt-nach-fiasko/)
- [University of Hamburg: When students meet personalities from business and society](https://www.uni-hamburg.de/newsroom/im-fokus/2022/0503-cheftreff.html)$kb$),
  ($kb$messeshop$kb$, $kb$Trade Fair Shop$kb$, $kb$> **Not final for 2027:** deadlines of the two ordering phases; range for the follow-up order; record the video guide again. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find a step-by-step guide to putting together your booth equipment. The trade fair shop is in your Partner Portal – you no longer need separate access.

## Two ordering phases

There are two ordering phases with different deadlines and choices:

**1. Main order – full selection**
- Access to the entire range
- Change your order as often as you like, add or remove products
- The order only becomes binding after the deadline

**2. Follow-up order – limited selection**
- A second order is possible, but only with a limited product selection
- Here too, you can make changes until the deadline
- The first order can then **no longer** be edited

**Both deadlines are in your task list in the Partner Portal**, with a reminder. Plan early so you have the full selection.

## What is the trade fair shop?

In the trade fair shop, you put together your booth equipment individually – from furniture to technology to extras. Everything you need for your booth can be ordered there.

## How to order step by step

1. **Log in:** Log in to the portal and open the trade fair shop.
2. **Choose products:** Put together your equipment:
   - Furniture (standing tables, bar stools, lounge furniture)
   - Plants
   - Technology and essentials (screens, extension cables)
   - Extras to upgrade the booth

   You will find all information directly on the product pages.
3. **Special requests:** Do you have special wishes that are not listed in the shop? Use the “Request product” button – or get in touch with your contact person.
4. **Complete the order:** Put all desired products in the basket and complete the order. You will receive an order summary by email. Changes are possible at any time until the respective deadline.

## Changing an order

Open your order in the portal, add or remove products and save. After the respective deadline has passed, the order is locked and can no longer be edited.

## Delivery on the event day

On the event day, your complete equipment is delivered directly to your booth. No transport, no setup, no extra effort for you.

## Important notes

- All products are rental equipment for the event days.
- Damage beyond normal signs of use will be charged on.
- In phase 2 the product selection is limited – ordering early pays off.$kb$),
  ($kb$messestand-rueckwand$kb$, $kb$Booth: Backdrop & Print Files$kb$, $kb$> **Not final for 2027:** deadline for the print files; booth sizes and dimensions for 2027; re-upload the printer's print data sheet; time for taking the backdrop with you at teardown. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

This page helps you create the right print file for the backdrop of your booth and submit it on time. Here you will find all information about the backdrop, the requirements and the print data.

## Deadline

**The deadline for the print files is in your task list in the Partner Portal**, with a reminder. Please be sure to let us know if there is a delay – then we will find a solution together.

## Who has to send in a file?

That depends on your **booth size**:

- **Smallest booth (start-up and initiative area):** no backdrop
- **All larger booths:** backdrop with print area

You will find your booth size in the **Partner Portal** and under “Floor Plan & Booth Overview”.

## Dimensions for design and bleed

These are the dimensions you can give to your graphics department. **Bleed is required** for printing:

- **1% bleed allowance all around (at least 20 mm), so 2% in total per dimension.**
- Always extend background graphics into the bleed.

The booth sizes and the resulting final formats depend on the 2027 floor plan. As soon as it is final, you will find the binding table with final format and data format per booth size here – and the same dimensions at your booth in the Partner Portal.

For orientation from last year: the backdrops were just under 3 m high; the width resulted from the booth size (one panel per 2 m of booth width).

## Graphic requirements

- **Safety margin:** text, logos, faces at least **100 mm** from the visible edge
- **File format:** PDF/X-4
- **Colour space:** CMYK (ISO Coated v2)
- **Resolution:** at least 62 dpi at final size
- **Fonts:** embed or convert to outlines
- **Safe zone** = 100 mm inwards, not part of the bleed
- **Final size** = visible frame
- **Data format** = final size plus bleed

## By when and where do I submit the print file?

- **Upload:** in the Partner Portal with your task
- **Deadline:** shown there, with a reminder

Please get in touch early if there are delays.

## What happens to the backdrop after the Summit?

- **Taking it with you:** You can take the backdrops with you at teardown on Saturday evening. Afterwards we collect them as part of teardown.
- **Storage:** Storage by us is not planned.
- **Recycling:** The backdrops are collected immediately at teardown and recycled.

## Official print data sheet

All detailed technical specifications are in our printer's print data sheet. You can pass this document directly on to your graphics agency – we will upload it here as soon as the printer for 2027 is fixed.$kb$),
  ($kb$oeffnungszeiten-ablauf$kb$, $kb$Opening Hours & Schedule$kb$, $kb$> **Not final for 2027:** binding times for 2027; supporting programme with partners, times and places; publication date of the programme. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find a rough overview of the opening hours and an explanation of the schedule and supporting programme. The content programme will be published in spring on our website and in the event app.

## The four days

| Date | Thu 15 April | Fri 16 April | Sat 17 April | Sun 18 April |
|---|---|---|---|---|
| | **Setup** | **Event** | **Event** | **Teardown** |

The Summit takes place on **Friday, 16 April 2027** and **Saturday, 17 April 2027**. Thursday is setup day, Sunday is teardown day. For external booth builders, setup already begins on Wednesday.

## Opening hours

The binding times for 2027 will be fixed as soon as hall planning is complete. For orientation, the rhythm of the previous year:

- **Partners: admission and delivery** on setup day in the afternoon, on the event days from early morning, on teardown day from early morning.
- **Participants: admission** on the first event day at midday, on the second event day in the late morning.
- **Programme** starts about one hour after admission in each case and ends in the early evening; the Main Stage closes last.
- **Trade fair operation** ends in the early evening, the supporting programme continues afterwards.

## Supporting programme

Around the Summit there are the hackathon, Company Tours and several evening formats. The **AI Hackathon** takes place on **15 and 16 April 2027**, the **Company Tours** on the Thursday before the Summit.

Which side events there will be in 2027, with which partners and at which places, has not been decided yet. The overview will appear here and in the programme as soon as it is fixed.

## Programme

We will publish the full programme with all talks, side events and the supporting programme in spring on our website and in the event app. You will then find the link here and in your portal.$kb$),
  ($kb$pfand$kb$, $kb$Deposit (Brand Partners & Attendees)$kb$, $kb$> **Not final for 2027:** deposit amount per container; terminal provider for collecting deposits; location of the deposit stations. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

To keep the floor clean at all times, there is a deposit system. Whether it applies to you, you can see below. In general:

1. You are an exhibitor and pour bottles that you booked through the trade fair shop? Then no deposit is necessary.
2. You have your own bar or serve drinks in cups? Then you will probably take part in the deposit system.

## The basic principle

- **Deposit:** a fixed amount per container subject to deposit. We will state the amount here as soon as it is fixed for 2027.
- **Payment (deposit collection):** only by **card or phone** via a **card reader**. You get the terminal from us.
- **Visitors receive per deposit transaction:**
  - the drink (cup or glass)
  - a **ChefTreff deposit chip** (we provide it)

**Important: no chip, no deposit back.**

## When is something subject to a deposit?

**A) Official drinks partners**
- If you are an official drinks partner with your own bar, the drinks you serve are generally subject to a deposit.
- For exceptions, such as mobile sampling campaigns, see below.

**B) Drinks in our reusable cups and glasses**
- Everything served in **our reusable cups or glasses** is subject to a deposit.
- You book our reusable cups and glasses through the **trade fair shop**.
- We do **not** use other reusable and deposit systems at the event. If you have a special case, talk to us early.

**Principle:** Everything served in reusable cups or glasses is subject to a deposit.

## What is not subject to a deposit?

**A) Mobile sampling campaigns (small quantities)**
- Drinks that you hand out in small quantities on the move, for example from a backpack, can run without a deposit. Please agree this with us in advance.

**B) Limited serving of sealed containers (no bar setting)**
- If you do not have a bar setup but only serve a limited number of sealed drinks – bottles or cans from a fridge or small setup – this is not subject to a deposit.

**C) Single-use**
- Anything that is clearly single-use is not subject to a deposit.

## Process at the booth

1. Visitors order a drink subject to a deposit.
2. You charge the deposit at the terminal (card or phone).
3. Visitors receive the drink and a **deposit chip**.

## Return and deposit refund

The deposit is refunded **exclusively** at:

- central **deposit stations** and
- **mobile deposit carts**

There are **no refunds** at partner booths and partner bars. The return points are signposted and accept all containers subject to a deposit.

## What we provide

- **Terminal** for collecting deposits (we clarify the number per booth in advance)
- **ChefTreff deposit chips**$kb$),
  ($kb$praesentationen$kb$, $kb$Presentations$kb$, $kb$> **Not final for 2027:** deadline for uploading the slides. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Everything about presentations for keynotes, pitches and panels.

## Can I bring a presentation?

Yes. We need it a few days before the event. Use your slides as a supporting element, for example with photos or key learnings. Slides with a lot of text or self-promotion are not welcome with us.

## Which formats are allowed?

PDFs are the easiest. PowerPoint also works. Please avoid Keynote, Google Slides or other online files – with such formats we cannot guarantee a smooth process.

## Where do I send my slides?

Upload your slides in your **Speaker Portal** with your task. **The deadline is shown there**, with a reminder.

Name the file in the pattern “Lastname_Firstname”, for example “Otto_Michael”.$kb$),
  ($kb$recruiting-best-practices$kb$, $kb$Recruiting: Best Practices$kb$, $kb$> **Not final for 2027:** date from which the filters in the event app are enabled. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

How do you get the best out of the Summit? How do you approach the talents? How do you shape your presence at the booth? Here you will find tips and recommendations on how to design your participation.

## The most important to-dos

- **Booth staff:** Think about who you bring along to position yourselves as an exciting employer in the best possible way – or, depending on your goal, as a partner, investor and so on.
- **Follow-ups:** Reserve a few time slots in your calendars right away for the two weeks after the Summit to plan follow-up conversations.
- **Event app:** List your jobs and products in the app so they are visible right away.
- **Templates:** Prepare conversation templates for chats with participants and create email templates for the time after the Summit.
- **Search profiles:** Create search profiles and run searches in the app.
- **Direct approach:** Approach interesting profiles directly and try to arrange appointments.

## What is the best way to staff the booth?

Put yourself in your target group's shoes: how would you, as a young person, be drawn to a booth? A few tips:

- Do not stand at the booth with too many people, spread out around it instead.
- Do not chat among yourselves in a closed circle, be open.
- Besides recruiters, also bring young people who can authentically tell their experiences at your company. “I have position X and do Y there, and it is great” works much better than a recruiter's story.

## What is the best way to present yourselves?

- Very relaxed and casual. Hoodie rather than business outfit. Be authentic.
- **Merch:** Feel free to come in uniform branding, but then pay even more attention to not standing at the booth in too large a group. Uniformity can otherwise come across as off-putting.
- **Colours:** Eye-catching colours create recognition – that helps people recognise you everywhere else at the fair, too.

## Who should be there and where?

It is best to create a combination of specialist staff and young people from your team who report authentically about your company. The division is decisive:

- **On the floor:** Have a team that moves around the fair and the entire event – ideally young people from your team who are outgoing and enthusiastic about their work. They have relaxed conversations and tell authentically about their work. If there is interest, they point to your booth. That way you have pre-qualification and are more effective at the booth.
- **At the booth:** Staff the booth with people from your HR or specialist department. This is where the deeper conversations take place, and you pre-qualify so that job interviews follow after the Summit.

## I have a Sponsored Talk – how do I make the best use of it?

You will find detailed content guidance under “Sponsored Talk”.

The most important thing: use the talk to position yourselves well and build an integration with the rest of your offering. Close with a pointer to the booth and the option of meetings in the app. Be approachable and show real interest in the listeners. Invite them to your booth for a drink, a Franzbrötchen (a Hamburg pastry) or to try a product.

## What is the best way to use the event app?

The event app is the digital companion to your physical presence. We recommend using it intensively even before the Summit.

**Before the Summit**

You want to have the best possible conversations at the Summit. You increase the quality by interacting with potentially interesting people beforehand:

1. Think about what makes interesting profiles for you and look at which filter options the app offers. The filters are enabled shortly before the event.
2. On this basis, create a search profile and look for interesting profiles directly in the app.
3. Think of a conversation guide and send participants requests and first messages:
   - Test different messages.
   - Tease first and close with open questions such as “Does that sound interesting to you?”
   - As a conclusion, either try to book an appointment or invite the people to the booth. You can book meetings at a meeting spot on the floor or directly at your booth.
4. Enter open positions and your products in the app so you can refer to them.

**At the Summit: lead scanning**

Everyone at the booth should have downloaded the app. Then:

1. Set it up for everyone so that the data is shared – see “Event App (Swapcard)”.
2. During the event, use the app to scan the QR codes of participants on their badges.
3. Use the rating and comment function when scanning.

You can create an overview of who from your team interacted with whom. Get in touch with these people and send further messages. Note your first impressions directly in comments. The Summit serves primarily to generate contacts – afterwards you go into depth.

Of course, you can also bring your own form for data collection to be safe. All data in the app is also available to you after the Summit.

**After the Summit**

The most important thing: be quick. With the Summit we want to create emotion, and guests go home with good memories. Accordingly, they are most receptive to further messages in the days afterwards. It is best to prepare the messages so that you only have to add notes from the conversations and send them right away.

Plan time slots right away for the time after the Summit in which you hold follow-up conversations. A message like *“Hey, it was great talking to you at the Summit. You really convinced us, and we would like to see whether there is a fit between us. Do you have time next Thursday at 2 pm?”* works well with our target group and shows real interest. The longer you wait and the longer the process, the lower the chance of success.

## What is the best way to follow up on the Summit?

Develop a structured approach to follow-up. Think about how you will contact the talents afterwards. The fresher the memory, the better.

In the best case, you prepare the email communication and think about what you want to achieve: should the talents join your talent pool? Should they actively apply? Should they come to an event of yours? You have a good chance – use it.$kb$),
  ($kb$speaker-briefing$kb$, $kb$Speaker Briefing$kb$, $kb$> **Not final for 2027:** link to the 2027 programme; deadline for the slides; evening programme with partners, times and places; link to the LinkedIn graphic generator. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find all the information about your speaking slot at the FUTURE LEADER SUMMIT 2027.

## Important pages

- “FAQ: Speaking at the Summit”
- “Presentations” (upload and FAQ)
- “Talk Guidelines & Titles”
- “Opening Hours & Schedule”

## Your contact persons

Your speaker buddy and your contact in the team are listed with name, photo, email and phone number in your Speaker Portal. General questions go to speaker@chef-treff.de.

## Your talk

- You will find your **slot** in the programme and in your Speaker Portal. Please check once that everything fits.
- **Technical equipment on site:** clicker, screen and headset or microphone. You do not have to bring anything.

## Presentation

We need your slides a few days before the event. The exact deadline is shown with your task in the Speaker Portal, where you also upload them.

## Venue and time

**16 and 17 April 2027**
CCH Congress Center Hamburg, Congressplatz 1, 20355 Hamburg

Details on how to get there are under “CCH: Location & Getting There”.

## Arrival and accreditation

Please be on site **at least one hour** before your appearance. You can go straight to the **speaker counter at the entrance**, where we will pick you up. You received your ticket by email – if you cannot find it, no problem, just report to the counter.

## Speaker lounge

We have a speaker lounge. There you can arrive in peace, put down your things and retreat at any time. Free catering is available for you in the speaker lounge.

## LinkedIn post

Would you like to announce your appearance? We provide a graphic for you – you will find the link here and in your Speaker Portal as soon as the 2027 templates are ready.

## Evening programme

On Friday and Saturday evening there are evening formats at and around the fair. Which ones they are in 2027, with which partners and at which places, will be stated here as soon as planning is complete. Staying late is worth it.

We look forward to seeing you.$kb$),
  ($kb$sponsored-talk$kb$, $kb$Sponsored Talk$kb$, $kb$> **Not final for 2027:** stage names and slot length for 2027. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

The Sponsored Talk is your opportunity to present yourselves to our audience. Here you will find tips on how to get the most out of it.

## Length and scope

The whole slot is 30 minutes but includes the introduction and wrap-up by the host. So you effectively have about 25 minutes. If you want to do a Q&A, factor that into your planning – the time comes out of your talk time.

## What is the best way to design the Sponsored Talk?

Create dynamics, variety and interest. Put yourselves in the target group's shoes: what could be exciting for young people interested in your company? Think in stories and examples.

**Do:** Tell exciting stories. Report on extraordinary projects and good experiences. Be personal and authentic. Perhaps bring someone who currently holds a position you want to fill and let that person report in a kind of interview format.

The mundane questions are especially interesting:

- What does it mean to be a junior manager, for example?
- What are my development prospects?
- Why do I enjoy working at your company?

Think integrated: at the end, point to your booth and the option of talking to you through the app as well. Be cool and open in the pitch – hoodie instead of suit, informal “you” instead of formal address and an emotional story instead of a sober list of benefits.

**Don't:** Do not simply present your company in the format “We have a fruit basket and a foosball table”. Tell stories and position yourselves as an employer only subtly. Speak to the talents at eye level, not from above.

## Tone

Open, motivating, inspiring. Try to create emotion. Address the thoughts, problems and wishes of the target group. A simple intro could be:

> “Hey, I'm XY, I started here with a traineeship and now get to lead a project. I didn't know what to do after my studies either, and I always thought a large corporation was not for me. But then I tried it, and the opportunities to shape things are really good. I experience that every day at …”

## Stage

Sponsored Talks usually take place on one of the stages integrated into the premium exhibition. Which stages these are in 2027 is shown in the programme.

## Silent stages

Important: these stages are **silent stages**. The audience listens through headphones.

Why do we do this? By placing the stage in the middle of the expo, we want to create dynamics on the one hand and, through the physical proximity, link the pitches with the booths on the other. To avoid sound problems, we use headphones – in our experience, this also increases focus and attention.$kb$),
  ($kb$stand-catering$kb$, $kb$Booth Catering & Crew Meals$kb$, $kb$> **Not final for 2027:** exclusive caterer for 2027; location of the crew area on the floor plan; drinks partner on the floor. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find all the information on how you can feed yourselves and your team on site and what you need to do to offer drinks or small snacks to participants at your booth.

## Food & beverages at the booth: rules

- **We work with an exclusive caterer:** All food and drinks you want to serve at your booth must be sourced through them. Which company that is in 2027, we will add here.
- **No own food and drinks:** Your own food and drinks may not be brought along or served yourselves.
- **Ordering:** In the trade fair shop in your Partner Portal you will find a selection of products ordered directly through the caterer. Is a product missing? Get in touch – we coordinate special requests individually and make almost anything possible.
- **Delivery:** All ordered food and drinks are delivered directly to your booth.

## Requirements for serving by partners

- **Alcohol:** Serving alcoholic drinks is only allowed from **4:00 pm**. Earlier serving is only possible by individual agreement.
- **No glass:** Glasses and glass bottles are not allowed. You can order sustainable cups through the trade fair shop, which are collected at central return stations – see “Deposit”.
- **Coordinating concepts:** If you have special catering ideas, please coordinate them with us in advance. That way we make sure everything runs and the rules are followed.

## Crew area: break, meals and working

- **Crew area:** There is a generous crew area for partners and booth teams. The exact location is shown on the floor plan as soon as it is available.
- **Meals:** Vegetarian dishes are available to choose from there. **Crew catering must be booked in advance in the trade fair shop.**
- **Meal times:** At midday there is a central serving point – you pick up the vouchers for it at the exhibitor kiosk.
- **Rest and work:** In the crew area you will find zones for catching your breath and for calls.

## Drinks at the Summit

On the floor there are **water stations** for refilling your bottles, plus offers from our drinks partners. Which ones they are in 2027 will be stated here as soon as the partnerships are fixed.

**Tip:** Be sure to bring your own water bottle for refilling.

## Any questions or special requests?

Whether it is a special request, an allergy or a particular requirement – get in touch with your contact person in the portal, we will find a solution together.$kb$),
  ($kb$talk-guidelines$kb$, $kb$Talk Guidelines & Titles$kb$, $kb$> **Not final for 2027:** upload the example presentation again. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find all the information on designing your talk. The target group is young, ambitious talents who want to be inspired by you.

## Which title should I choose?

Target-group oriented: what interests a young person between 20 and 30 who comes to an event like this? Be concise and create curiosity. State in the title already what guests can expect. Examples:

- *The five most important trends in AI*
- *Invisible power structures – and how you can use them for your career*
- *Freedom vs. security: my path into self-employment*
- *Mental health meets peak performance: how do I deal with extremely demanding environments?*
- *Going beyond: How to achieve the extraordinary*

## What is the best way to design your contribution?

Create dynamics, variety and interest. Put yourselves in the target group's shoes: what could be exciting for young people? Think in stories and examples.

- Lots of pictures and anecdotes are welcome
- Concrete, practical tips are welcome, for example “My top 5 learnings for you: #1 You can't compete with someone who is having fun, #2 Your network is your net worth, …”

## Should I interact with the audience?

Definitely. You have the opportunity for Q&A at the end of your talk. Use it – an exchange is always more exciting than pure one-way broadcasting.

## How should I present myself?

Authentic and approachable. Bring in personal touches and tell of your own experiences. This makes it easier for the audience to follow you and creates closeness. The most honest and vulnerable contributions are usually the most inspiring.

## Tone

Open, motivating, inspiring. Try to create emotion. Address the thoughts, problems and wishes of the target group. The summit stands under the narrative “German Mut instead of German Angst” (courage instead of anxiety) – try to design your contribution so that you encourage people.

## Do's

- Tell exciting stories
- Concrete learnings, for example “My three tips”
- Create knowledge that gets passed on – closing slide with key takeaways
- Be relaxed on stage: hoodie instead of suit, informal “you” instead of formal address
- Create emotion: that is how you build closeness
- Speak to guests at eye level

## Don'ts

- Do not sell your company or product – it does not work with the target group
- Do not be too stiff; formal address creates distance
- Do not put yourself as a person in the foreground, but your learnings, experiences and knowledge

## Example presentation

We will provide an example presentation here as soon as it is available for 2027.$kb$),
  ($kb$tickets-akkreditierung$kb$, $kb$Tickets & Accreditation$kb$, $kb$> **Not final for 2027:** redemption deadline for the ticket codes; accreditation times on Thursday and Friday. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Here you will find an overview and instructions on how to redeem your tickets.

## How do you get your tickets?

In your Partner Portal, under **Your tickets**, you will find the ticket codes for redemption. Depending on your package, you have the following codes:

1. **Partner tickets:** This code is for your staff – everyone at the booth, at a Masterclass or representing you at the Summit in any other form.
2. **Talent tickets:** This code is for talents from your company. With it you can, for example, enable your trainees or juniors to take part – whether they help out or simply attend as guests.

You will also find the link for redemption in the Partner Portal. You need your code to unlock it.

## Who are the tickets for?

- Your **team** on site → “Partner” code and ticket
- **Students**, **apprentices** or other **young talents** from your company whom you would like to bring along → “Talent” code and ticket
- **Applicants** you would like to get to know in a relaxed setting

## Redemption instructions (two steps)

**Step 1: Enter the code and redeem the ticket**

Enter your partner code in the window after clicking “Buy ticket”. This gives you access to the shop. The partner code allows you to redeem “Partner” tickets; the talent code allows you to redeem “Talent” and “Student” passes.

**Step 2: Personalising the tickets**

After buying the tickets, they have to be personalised. That way you can hand them out directly. Be sure to enter a separate email address for each person, otherwise they will not get access to the event app.

## What do you need to keep in mind?

- **Each person** needs their **own ticket**. The wristbands cannot be passed on. This also applies to booth staff who change over the two days.
- When personalising, be sure to enter a separate address per person – not your own ten times. Otherwise the other ticket holders will not get access to the event app.
- If you **need more tickets**, let us know briefly – then we will find a solution.
- **The deadline for redemption is in the Partner Portal with your task.** We expect to be completely sold out. It therefore helps a lot if you redeem the tickets on time so that we can put unused tickets back on sale.

## When and where can you get accredited?

**Accreditation** is possible on Thursday afternoon and on Friday morning before the opening, otherwise during normal opening hours. If you arrive later, report to the speaker counter at the entrance – then you will get your wristband faster.$kb$),
  ($kb$ueber-cheftreff$kb$, $kb$About ChefTreff$kb$, $kb$> **Not final for 2027:** team size; number of speakers and guests for 2027. We will add the details here as soon as they are fixed — binding deadlines always also appear in your task list in the portal.

Everything you need to know about ChefTreff. We are the platform behind the FUTURE LEADER SUMMIT. Our team works to give you the best possible experience. If you have questions, feel free to get in touch with us at any time.

## What is ChefTreff?

**ChefTreff** is Germany's career platform for the next generation of leaders – founded in 2017 in Hamburg. What began as a small networking event with 100 participants has grown into a year-round ecosystem of over 100,000 people.

The mission: young talents should not just dream, but receive concrete orientation for their careers – with real knowledge, relevant skills and the right network.

**The FUTURE LEADER SUMMIT 2027** is Europe's largest non-profit event for students, talents, young professionals and start-ups. On **16 and 17 April 2027**, thousands of talents come together at the **Congress Center Hamburg** to learn from top speakers.

**And who are we?** We are a team of ambitious Hamburg young professionals with the vision of creating a place where young people learn from the best, network and shape Europe's future together.

## Our story

The vision of ChefTreff, which began in 2017 in a small Hamburg university lecture hall, was to create “TED Talks for students”. The success was overwhelming: within two years, the number of participants grew from 100 to over 1,000.

Today, besides the annual **FUTURE LEADER SUMMIT**, ChefTreff also includes a podcast, a leadership academy, various insight sessions and free community events on topics such as tech, finance, impact and entrepreneurship.

As a **non-profit event**, ChefTreff creates a platform that connects science, business and future talents. Our non-profit platform promotes the **exchange between theory and practice** in order to jointly develop solutions to the challenges of our time. Through direct contact with inspiring role models, we support the professional development and spirit of innovation of the next generation.

Our commitment is carried by a **motivated team** that works together with passion and expertise. Every member contributes their individual skills to make ChefTreff a place of inspiration and progress.

For our partners, we offer the opportunity to connect with the talents of tomorrow and build lasting relationships that help build outstanding teams.

## Thank you for being part of it

The FUTURE LEADER SUMMIT could not take place without our speakers and partners – **people like you**, who share their learnings with the next generation and open doors for ambitious young people who want to make a difference.$kb$)
      ) as v (slug, title, body) on v.slug = d.slug
     where d.language = 'de' and d.edition_id is null
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from neu;
  perform log_audit('kb.en_drafts_seeded', 'kb_article', 'en', null, jsonb_build_object('count', v_n));
end $mig$;

select harden_definer_functions();
