import {EventConfig} from 'motia'

// STEP-4: uses gemini, whichever model you want to generate better improved yt titles

export const config = {
    name: "generateTitles",
    type: "event",
    subscribes: ["yt.videos.fetched"],
    emits: ["yt.titles.ready", "yt.titles.error"],
    
    
};

interface Video {
    videoId: string;
    title: string;
    Url: string;
    publishedAt: string;
    thumbnail: string;
}

interface ImprovedTitles {
    original: string;
    improved: string;
    rational: string;

}

export const handler = async (eventData: any, {emit, logger, state}:any )=>{
    
    let jobId: string | undefined;
    let email: string | undefined;

    try {
        const data = eventData || {};
        jobId= data.jobId;
        email= data.email;
        
        const channelName = data.channelName;
        const videos = data.videos;

        logger.info("Resolving Youtube Channel",{jobId, videoCount: videos.length});
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY

        if(!GEMINI_API_KEY){
            throw new Error("Gemini api key not configured.")
        }

        const jobData = await state.get(`job: ${jobId}`);
        
        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Generating Titles"
        })

        const videoTitles = videos.map((v:Video, index: number)=>`${index+1}. "${v.title}"`).join('\n')

        const prompt = `You are a YouTube title optimization expert. Below are ${videos.length} video titles from the channel "${channelName}".

For each title, provide:
1. An improved version that is more engaging, SEO-friendly, and likely to get more clicks
2. A brief rationale (1-2 sentences) explaining why the improved title is better

Guidelines:
- Keep the core topic and authenticity
- Use action verbs, numbers, and specific value propositions
- Make it curiosity-inducing without being clickbait
- Optimize for searchability and clarity

Video Titles:
${videoTitles}

Respond in JSON format:
{
  "titles": [
    {
      "original": "...",
      "improved": "...",
      "rationale": "..."
    }
  ]
}`

        // const response = await fetch("https://api.openai.com/v1/chat/completions",
        //     {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type':"application/json",
        //             'Authorization':`Bearer ${GEMINI_API_KEY}`
        //         },
        //         body: JSON.stringify({
        //             model: 'gemini-2.5-flash',
        //             messages: [{
        //                 role: 'system',
        //                 content: "You are a youtube seo and engagement expert who helps creators write better video titles"
        //             },{
        //                 role: 'user',
        //                 content: prompt
        //             }],
        //             temperature: 0.7,//how much creative do you allow it to be?
        //             response_format: {type: 'json_object'}
        //         })
        //     }
        // )


        const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [//Gemini doesn’t have a dedicated “system” message field like OpenAI.
// But you can still include system-like instructions by simply putting them at the start of the user message text., it doesn't have response_format field as well.
            {
              text: `You are a YouTube SEO and engagement expert who helps creators write better video titles.\n\n${prompt}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7 // controls creativity
      }
    }),
  }
);
    if(!response.ok){
        const errorData = await response.json();
        throw new Error(`Gemini api error ${errorData.error?.message}` || 'Unknown Ai error');
    }
    // now since we were using fetch instead of this way below:
        //     import { GoogleGenAI } from "@google/genai";

        // const ai = new GoogleGenAI({});

        // async function main() {
        // const response = await ai.models.generateContent({
        //     model: "gemini-2.5-flash",
        //     contents: "Explain how AI works in a few words",
        // });
        // console.log(response.text);
        // }

        // await main();

    //if you go into the docs(gemini) and then see this(it's the javascript implementation) 
    // then if you see the rest implementation, you get a better idea:
//     curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
//   -H "x-goog-api-key: $GEMINI_API_KEY" \
//   -H 'Content-Type: application/json' \
//   -X POST \
//   -d '{
//     "contents": [
//       {
//         "parts": [
//           {
//             "text": "Explain how AI works in a few words"
//           }
//         ]
//       }
//     ]
//   }'

// this explains what kind of data you'd recieve, what url you should use.

    const aiResponse = await response.json();
    //it'll return us text.
    const aiContent = aiResponse.candidates[0].content.parts[0].text//we got this idea from the rest implementation above.
    //now we gotta parse it to json
    const parsedResponse = await JSON.parse(aiContent);

    //now we just have to extract titles out of it.
    const improvedTitles: ImprovedTitles[] = parsedResponse.titles.map((title: any, index: number)=>({
        original: title.original,
        improved: title.improved,
        rational: title.rational,
        url: videos[index].url//not doing index+1 here as it was only for the format in which we showed titles when we fetched videos above.
    }))

    logger.info('titles generated successfully',{
        jobId, count: improvedTitles.length
    })

    //updating state
        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: 'Titles ready',
            improvedTitles
        })
        // emitting event
        await emit({
            topic: "yt.titles.ready",
            data: {
                jobId,
                channelName,
                email,
                improvedTitles

            }

        })



    } catch (error: any) {
        logger.error("Error generating titles",{
            error: error.message
        })
        if(!jobId || !email){
            logger.error("Cannot send error notification because we have a missing jobId or email")
            return 
        }

        const jobData = await state.get(`job: ${jobId}`)

        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: 'Failed',
            error: error.message
        })

        await emit({
            topic: "yt.titles.error",
            data: {
                jobId,
                email,
                error: 'Failed to fetch improved titles for the videos. Please try again later'
            }

        })
    }
}
// now we have generated titles, now we just gotta send the email through resend in step-04