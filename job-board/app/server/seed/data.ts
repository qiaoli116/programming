// Demo data for iteration 1: 6 employers, 8 seekers, 30 jobs, 45 applications.
// All demo accounts use the same password (demo only).
import type { WorkType } from '@jobboard/shared';

export const DEMO_PASSWORD = 'demo1234';

export const employers = [
  { name: 'Hannah Brooks', email: 'hiring@northwind.example', companyName: 'Northwind Digital' },
  { name: 'Marco Rossi', email: 'hiring@cornercoffee.example', companyName: 'Corner Coffee Co.' },
  { name: 'Priya Nair', email: 'hiring@westside.example', companyName: 'Westside Health' },
  { name: 'Leo Fischer', email: 'hiring@studiomono.example', companyName: 'Studio Mono' },
  { name: 'Grace Tan', email: 'hiring@harbour.example', companyName: 'Harbour Insurance' },
  { name: 'Tom Murphy', email: 'hiring@quickship.example', companyName: 'QuickShip Logistics' },
];

export const seekers = [
  { name: 'Alex Chen', email: 'alex.chen@example.com' },
  { name: 'Sam Rivera', email: 'sam.rivera@example.com' },
  { name: 'Maya Patel', email: 'maya.patel@example.com' },
  { name: 'Jordan Lee', email: 'jordan.lee@example.com' },
  { name: 'Taylor Nguyen', email: 'taylor.nguyen@example.com' },
  { name: 'Chris Walker', email: 'chris.walker@example.com' },
  { name: 'Imogen Clarke', email: 'imogen.clarke@example.com' },
  // Applies to nothing: shows the empty state on "My applications".
  { name: 'Daniel Okafor', email: 'daniel.okafor@example.com' },
];

export interface SeedJob {
  employer: number; // index into employers
  title: string;
  location: string;
  workType: WorkType;
  salary: string | null;
  daysAgo: number;
  about: string;
  requirements: string[];
}

const j = (
  employer: number,
  title: string,
  location: string,
  workType: WorkType,
  salary: string | null,
  daysAgo: number,
  about: string,
  requirements: string[],
): SeedJob => ({ employer, title, location, workType, salary, daysAgo, about, requirements });

export const jobs: SeedJob[] = [
  // Northwind Digital (0..4)
  j(0, 'Frontend Developer', 'Melbourne VIC', 'Full-time', '$90k – $110k', 2,
    'Northwind Digital is looking for a Frontend Developer to join our product team. You will build and maintain customer-facing web applications, turn designs into fast, accessible interfaces and work closely with designers and backend engineers.',
    ['2+ years building web apps with HTML, CSS and JavaScript', 'Experience with a modern framework (React, Vue or similar)', 'Care for accessibility and clean, readable code', 'Good communication and a willingness to learn']),
  j(0, 'Backend Developer', 'Melbourne VIC', 'Full-time', '$100k – $125k', 9,
    'Design and build the APIs behind our products. You will own services end to end, from the database to deployment.',
    ['3+ years with Node.js, Python or similar', 'Comfortable with SQL databases', 'Experience writing automated tests']),
  j(0, 'QA Engineer', 'Remote', 'Contract', '$550 / day', 15,
    'Help us ship with confidence. You will plan and run manual and automated tests across our web products.',
    ['Experience testing web applications', 'Some automation experience (Playwright, Cypress or similar)', 'Clear, careful bug reports']),
  j(0, 'Product Designer', 'Melbourne VIC', 'Full-time', '$95k – $115k', 21,
    'Shape how our products look and feel, from first sketch to shipped interface.',
    ['A portfolio of shipped digital products', 'Skilled in Figma or a similar tool', 'Comfortable running user interviews']),
  j(0, 'Customer Support Specialist', 'Remote', 'Part-time', '$32 / hour', 30,
    'Be the friendly voice of Northwind. You will answer customer questions and pass on feedback to the product team.',
    ['Excellent written communication', 'Patience and empathy', 'Comfortable learning new software quickly']),

  // Corner Coffee Co. (5..8)
  j(1, 'Barista', 'Sydney NSW', 'Part-time', '$28 – $32 / hour', 3,
    'Make great coffee and greet our regulars by name. Weekend and early-morning shifts available.',
    ['Previous barista experience preferred', 'Friendly and reliable', 'Able to work weekends']),
  j(1, 'Café Supervisor', 'Sydney NSW', 'Full-time', '$62k + super', 11,
    'Lead the floor during busy periods, train new staff and keep the café running smoothly.',
    ['2+ years in hospitality', 'Leadership or training experience', 'RSA certificate']),
  j(1, 'Kitchen Hand', 'Sydney NSW', 'Casual', '$27 / hour', 18,
    'Support our kitchen with prep, cleaning and dishes. A great first job in hospitality.',
    ['No experience needed', 'Able to stand for long shifts', 'Reliable and punctual']),
  j(1, 'Assistant Store Manager', 'Brisbane QLD', 'Full-time', '$70k – $78k', 27,
    'Help manage our new Brisbane store: rostering, ordering, and keeping standards high.',
    ['Management experience in retail or hospitality', 'Confident with rosters and ordering', 'Strong customer focus']),

  // Westside Health (9..14)
  j(2, 'Registered Nurse', 'Brisbane QLD', 'Full-time', '$85k + super', 4,
    'Provide high-quality patient care in our busy community health clinic, working with a supportive multidisciplinary team.',
    ['Current AHPRA registration', 'Experience in general or community nursing', 'Strong clinical documentation skills']),
  j(2, 'Enrolled Nurse', 'Brisbane QLD', 'Part-time', '$42 / hour', 10,
    'Assist registered nurses and provide direct patient care across our clinic.',
    ['Current AHPRA registration', 'Certificate IV or Diploma in Nursing', 'Good teamwork']),
  j(2, 'Medical Receptionist', 'Brisbane QLD', 'Full-time', '$58k', 16,
    'Welcome patients, manage bookings and keep our front desk running calmly.',
    ['Previous reception or customer service experience', 'Comfortable with booking software', 'Warm, professional manner']),
  j(2, 'Allied Health Assistant', 'Brisbane QLD', 'Part-time', '$38 / hour', 23,
    'Support physiotherapists and occupational therapists with patient programs and equipment.',
    ['Certificate IV in Allied Health Assistance', 'Caring and patient', 'Current first aid certificate']),
  j(2, 'Night Shift Nurse', 'Brisbane QLD', 'Casual', '$55 / hour', 33,
    'Cover overnight shifts in our after-hours care unit.',
    ['Current AHPRA registration', 'Available for night shifts', 'Calm under pressure']),
  j(2, 'Health Information Officer', 'Brisbane QLD', 'Full-time', null, 40,
    'Keep patient records accurate, secure and easy to find.',
    ['Attention to detail', 'Understanding of privacy requirements', 'Confident with databases']),

  // Studio Mono (15..19)
  j(3, 'Graphic Designer', 'Melbourne VIC', 'Contract', '$600 / day', 5,
    'Create brand identities, campaign graphics and print work for our growing client list.',
    ['Strong portfolio of brand and print work', 'Fluent in Adobe Creative Suite', 'Able to take a brief and meet deadlines']),
  j(3, 'Junior Illustrator', 'Melbourne VIC', 'Part-time', '$30 / hour', 13,
    'Illustrate book covers, posters and editorial pieces under the guidance of our art director.',
    ['A portfolio showing your drawing style', 'Comfortable with digital illustration tools', 'Open to feedback']),
  j(3, 'Content Writer', 'Remote', 'Contract', '$450 / day', 19,
    'Write clear, lively copy for websites, campaigns and newsletters.',
    ['Excellent English writing', 'Samples of published work', 'Able to adapt tone for different clients']),
  j(3, 'Marketing Assistant', 'Melbourne VIC', 'Full-time', '$60k – $68k', 26,
    'Support our marketing team with social media, email campaigns and reporting.',
    ['Degree or experience in marketing or communications', 'Confident on social media platforms', 'Organised and curious']),
  j(3, 'Art Director', 'Melbourne VIC', 'Full-time', null, 36,
    'Lead the creative direction on client projects and mentor our designers.',
    ['5+ years in a design or creative role', 'Experience leading creative teams', 'Excellent presentation skills']),

  // Harbour Insurance (20..23)
  j(4, 'Data Analyst', 'Sydney NSW', 'Full-time', null, 7,
    'Turn claims and policy data into insights that help us price risk and serve customers better.',
    ['Strong SQL and spreadsheet skills', 'Experience with a reporting tool (Power BI, Tableau or similar)', 'Clear communication of findings']),
  j(4, 'Claims Officer', 'Sydney NSW', 'Full-time', '$72k', 14,
    'Assess and process insurance claims, keeping customers informed at every step.',
    ['Experience in insurance or financial services', 'Fair and detail-oriented', 'Good customer communication']),
  j(4, 'Customer Service Assistant', 'Sydney NSW', 'Part-time', '$34 / hour', 22,
    'Answer customer calls and emails about policies and claims.',
    ['Previous contact-centre experience helpful', 'Clear phone manner', 'Comfortable with computer systems']),
  j(4, 'Underwriting Assistant', 'Sydney NSW', 'Full-time', '$68k – $75k', 29,
    'Support our underwriters with risk assessments, documentation and policy checks.',
    ['Interest in insurance and risk', 'Strong attention to detail', 'Confident with Excel']),

  // QuickShip Logistics (24..29)
  j(5, 'Warehouse Assistant', 'Perth WA', 'Casual', '$30 / hour', 8,
    'Pick, pack and load orders in our busy distribution centre.',
    ['Able to lift up to 20 kg', 'Reliable and punctual', 'Safety-conscious']),
  j(5, 'Forklift Operator', 'Perth WA', 'Full-time', '$34 / hour', 12,
    'Move pallets safely and efficiently around our warehouse and loading dock.',
    ['Current forklift licence', '1+ year operating forklifts', 'Strong safety record']),
  j(5, 'Delivery Driver', 'Adelaide SA', 'Casual', '$31 / hour', 17,
    'Deliver parcels to homes and businesses across metropolitan Adelaide.',
    ['Full driver licence', 'Good local knowledge', 'Friendly and trustworthy']),
  j(5, 'Logistics Coordinator', 'Perth WA', 'Full-time', '$78k', 25,
    'Plan routes, track shipments and keep customers up to date on their deliveries.',
    ['Experience in logistics or supply chain', 'Strong planning and organisation', 'Confident with tracking software']),
  j(5, 'Dispatcher', 'Adelaide SA', 'Part-time', null, 32,
    'Assign jobs to drivers and respond to changes through the day.',
    ['Calm under pressure', 'Clear radio and phone communication', 'Good geographic sense']),
  j(5, 'Warehouse Team Leader', 'Perth WA', 'Full-time', '$85k', 42,
    'Lead a shift of warehouse staff, keeping orders accurate and the team safe.',
    ['Team leadership experience', 'Knowledge of warehouse systems', 'Commitment to workplace safety']),
];

// Each seeker's applications, as indexes into `jobs`, from most to least recent.
export const applicationsBySeeker: number[][] = [
  [0, 1, 3, 5, 9, 15, 20, 24, 2, 18], // Alex Chen: the demo seeker with plenty of history
  [0, 5, 24, 25, 26, 7],
  [0, 1, 2, 3, 5, 20],
  [5, 6, 7, 8, 15, 18],
  [9, 10, 11, 12, 13, 14],
  [0, 1, 15, 17, 19, 21],
  [5, 0, 22, 23, 17],
  [],
];

export const coverLetters = [
  'Hello, I would love to join your team. My experience matches what you are looking for and I am available to start soon.',
  'I am excited about this role. I have worked in a similar position before and enjoy learning new things quickly.',
  'Please find my application attached to this message. I am reliable, friendly and keen to contribute from my first week.',
  'This job looks like a great fit for my skills and interests. I would welcome the chance to talk about how I can help.',
  'I have followed your company for some time and would be proud to work with you. I am happy to provide references.',
];
