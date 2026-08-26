// Strict factory for the 12 zinbit endpoints.
// CRITICAL: Generate completely synthetic payload responses. ABSOLUTELY NO real PII.

export const mockEndpoints = {
  emailToPhone: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "john@example.com": {
        phone: '+1-555-019-8472',
        countryCode: 'US',
        type: 'mobile',
        carrier: 'Synthetic Telecom'
      },
      "others@example.com": {
        phone: '+44-7700-900077',
        countryCode: 'UK',
        type: 'mobile',
        carrier: 'MockNet'
      }
    }
  }),

  phoneToEmail: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "+91 9876543210": {
        email: 'jane.doe.synthetic@example.com',
        deliverability: 'deliverable',
        isDisposable: false
      }
    }
  }),

  linkedinUrlToProfileData: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "https://www.linkedin.com/in/john-doe": {
        firstName: 'John',
        lastName: 'Smith',
        currentCompany: 'Mock Corp LLC',
        jobTitle: 'Senior Vice President of Engineering',
        location: 'Fictional City, State',
        skills: ['Synthetic Data', 'API Design', 'Privacy Engineering']
      }
    }
  }),

  linkedinUrlToPhoneEmail: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 2 },
    data: {
      phone_numbers: ["+1-555-019-8472"],
      emails: ["synthetic.john@mockcorp.test"]
    }
  }),

  peopleSearch: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 10 },
    pagination: { page: 1, count: 10, total: 142 },
    data: [
      {
        name: 'Alex Johnson',
        title: 'VP of Sales',
        company: { name: 'SaaS Innovators Inc', domain: 'saasinnovators.test' },
        location: 'Bengaluru, India'
      },
      {
        name: 'Priya Sharma',
        title: 'Director of Marketing',
        company: { name: 'Tech Solutions LLC', domain: 'techsolutions.test' },
        location: 'Mumbai, India'
      }
    ]
  }),

  peopleAiSearch: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 10 },
    parsed_intent: {
      role: "Head of Marketing",
      industry: "Fintech",
      location: "Bengaluru",
      company_size: "50-200"
    },
    data: [
      {
        name: 'Rahul Verma',
        title: 'Head of Marketing',
        company: { name: 'Fintech Neo', domain: 'fintechneo.test' },
        location: 'Bengaluru, India'
      }
    ]
  }),

  domainToCin: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    summary: { input: 1, found: 1, not_found: 0 },
    found: {
      "example.com": {
        cin: "U12345MH2024PTC000000",
        company_name: "Example Private Limited",
        status: "Active",
        type: "Private",
        incorporation_year: "2024"
      }
    },
    not_found: []
  }),

  cinToCompanyData: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "U00000AA0000AAA000001": {
        company_name: "Synthetic Solutions Pvt Ltd",
        registered_address: "123 Mock Street, Fictional City, 10001",
        industry: "Information Technology",
        revenue_range: "$1M - $10M",
        paid_up_capital: "1000000",
        directors_data: [
          { name: "Emily Chen", din: "00000001", designation: "Director" }
        ]
      }
    }
  }),

  domainToLinkedinUrl: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "example.com": {
        linkedin_url: "https://linkedin.com/company/example-corp",
        name: "Example Corp",
        industry: "Technology",
        headcount: "51-200"
      }
    }
  }),

  contactToLinkedinUrl: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      linkedin_url: "https://linkedin.com/in/synthetic-profile",
      name: "John Doe",
      job_title: "Software Engineer",
      matched_on: ["email", "phone"],
      confidence: "High",
      score: 95
    }
  }),

  reverseEnrichment: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    results: [
      {
        input: { person_name: "John Doe", company_name: "Example" },
        company_resolution: { domain: "example.com", name: "Example Corp" },
        person_match: { score: 98, profile_snapshot: "Founder at Example Corp" },
        ln_url: "https://linkedin.com/in/johndoe-founder"
      }
    ]
  }),

  dinToPhone: (payload: any) => ({
    status: 'success',
    cost: { credits_charged: 1 },
    data: {
      "00000001": ["+91-0000000001", "+91-0000000002"],
      "00000002": ["+91-0000000003"]
    }
  })
};
