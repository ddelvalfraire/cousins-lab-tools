# Asaph Meeting Transcript — October 19, 2026

Source: `New_Recording_51_eng.txt`  
Duration: 00:45:55  

## Attendees

| Name | Role | Talk time | Turns |
|---|---|---|---|
| Asaph | Lab principal investigator | 00:19:34 | 181 |
| David | Student team | 00:10:02 | 114 |
| Ethan | Student team | 00:06:43 | 100 |
| Diego | Lab researcher | 00:00:58 | 14 |

## Transcript

**Ethan** `00:00:00`  
couldn't make it today. He was sick, so.

**Asaph** `00:00:02`  
Okay. Diego might be here, uh, shortly.

**Ethan** `00:00:06`  
Cool.

**Asaph** `00:00:06`  
So, uh, before we jump into it, tell me how you're finding the getting access and getting under the hood.

**Ethan** `00:00:12`  
We've, we've got access. We've read through the program. We've got a good idea how it works. Uh, we see a lot of areas for improvement, and that's part of what we wanted to demonstrate for you today.

**Asaph** `00:00:20`  
Yeah.

**Ethan** `00:00:21`  
Uh, because we'd like to float the idea of us potentially-

**Asaph** `00:00:25`  
Hey, Diego.

**Ethan** `00:00:26`  
Hey, Diego. Redoing your whole platform.

**Asaph** `00:00:28`  
Oh, geez.

**Ethan** `00:00:29`  
[laughs]

**Asaph** `00:00:30`  
Um, well, I think, yes, maybe. Uh, but only if there's real clear reason to do it, 'cause we've only just got it up and running. Um, so I wanna make sure there's no crash or whatever.

**Ethan** `00:00:43`  
I mean, don't get me wrong. We... Go ahead. Sorry.

**Asaph** `00:00:44`  
Well, I just think, um... And I think that that can be an exercise for us to do, um, as long as we still retain control of the last version that we have, so that we know that we have that, uh, operational.

**Ethan** `00:00:58`  
Yeah.

**Asaph** `00:00:58`  
Yeah. So that would be my, um, biggest concern.

**Ethan** `00:01:01`  
Yeah. So, of course, you'll have access to the original software.

**Asaph** `00:01:05`  
Yeah.

**Ethan** `00:01:06`  
Our big thoughts were, we were reading through, like, the assignment that the previous teams were given, and it started off as a purely make a display for this mass spectrometer-

**Asaph** `00:01:17`  
Mm-hmm

**Ethan** `00:01:17`  
... as far as I can tell. And if you want to add more instruments in the future, right now, that's not an easy task with your current software. And we could rewrite it to work faster, not crash as often, and be super easy to add new instruments to in the future.

**Asaph** `00:01:32`  
That sounds all great.

**David** `00:01:33`  
There's also, um, the way that the existing application handles storage, there's actually more overhead in storing the files than there is information that you're storing. So for every one megabyte of data, you're storing about four megabytes of overhead.

**Asaph** `00:01:48`  
Mm-hmm.

**David** `00:01:48`  
And so that's not ideal, right?

**Asaph** `00:01:50`  
Is that with both, uh, machines? Like, um, when we're using the acquisitions or when we're streaming the data, um, through, what's the name of the software? Easy View?

**David** `00:02:02`  
Yeah. So all of the applications that you use are built off of very similar executables with added features on top.

**Asaph** `00:02:10`  
Mm-hmm.

**David** `00:02:11`  
And so all of them would, uh, experience the same issues that we're describing.

**Asaph** `00:02:15`  
Cool.

**Ethan** `00:02:18`  
Then we've got some of the fixes you requested. Uh, you can see the chart title now shows the current acquisition. Or sorry, the window title shows the current acquisition.

**David** `00:02:28`  
Some time might be in the way there, but-

**Ethan** `00:02:29`  
Uh-

**David** `00:02:30`  
Yeah. So essentially, uh, a couple of your requests were to being able to show the actual folder that, uh, where the acquisition is located. So now that's up here in the title whenever you open it.

**Asaph** `00:02:41`  
Okay.

**David** `00:02:41`  
Uh, the other requirement you asked for was to go ahead and, uh, add configurability for these line charts and these plots. And so you can now change the color, uh, to whatever you'd like to. Um, and you can also configure the width and the, uh... Sorry, you can also configure the width of a line, and it'll persist, um, after you close the entire application. So both of those have been taken care of.

**Asaph** `00:03:08`  
Nice. How do you get to that window? Just by clicking on it?

**David** `00:03:11`  
Yeah. All you have to do is just double-click on the line, and then it'll pull up.

**Asaph** `00:03:17`  
Um, can I ask about the, the text up there with the lab directory? Will it say which acquisition? Will it say, like, acquisition 200 or whatever?

**David** `00:03:25`  
Yeah. So it's gonna be whatever that folder is named. So in this case, this folder is just named Acquisition.

**Asaph** `00:03:31`  
Okay, cool.

**Ethan** `00:03:37`  
I think that's pretty much everything we had to show. Uh-

**David** `00:03:40`  
Yeah. That, that's pretty much all the changes-

**Ethan** `00:03:42`  
Well, for the-

**David** `00:03:42`  
... that we made for the existing software.

**Ethan** `00:03:43`  
Existing software, yeah.

**David** `00:03:44`  
Unless you had, uh, any other asks for it.

**Asaph** `00:03:48`  
Um, no. I mean, I think the other, um... Let me just double-check. Can you scroll down? So this is for module two? Is that right?

**David** `00:03:59`  
Yeah, that's right. This is module two.

**Asaph** `00:04:00`  
Okay. Yeah, I think the other, the only other thing would be to have a similar feature, uh, on module one, um, which is, uh, basically the same thing.

**Ethan** `00:04:12`  
Yeah.

**David** `00:04:13`  
Yep. It, it's, uh... All these changes are made in all, all three executables already.

**Asaph** `00:04:17`  
Oh, they are? Okay.

**David** `00:04:18`  
Yeah.

**Asaph** `00:04:18`  
Got it. Um, no, I think, uh, that was the baseline, right? And I think the other was sort of integrating in the other, um, the AMBIT software or the control of the AMBIT.

**Ethan** `00:04:30`  
Yeah. We've been holding off on doing that until we got your feedback on whether or not we wanna redo the software.

**Asaph** `00:04:34`  
Okay. So what does it mean to do that? Like, what would you, what would you have to do to redo it? And would it be the user interface that would also be changing?

**David** `00:04:46`  
Do you mind if I?

**Ethan** `00:04:47`  
Go for it.

**David** `00:04:48`  
So in a nutshell, what it's gonna consist of, um, is first, we, we would have to walk through this application and build a map of the existing behaviors.

**Asaph** `00:04:56`  
Yeah.

**David** `00:04:56`  
And then we could go ahead and start from that baseline. Um, and essentially, the, the goal that we're trying to achieve is to have better separation between the UI-

**Asaph** `00:05:06`  
Mm-hmm

**David** `00:05:06`  
... um, and the actual processing software. Right now, there's a lot of issues in the way that everything is coupled together. And so it leads to some crashes. It leads to, um, unnecessary bloat in the software, and it also makes it harder to work in for whoever comes after us, and for us, frankly. Um, and so the ultimate goal is to build this application that's gonna consolidate the three different executables that you have, while still maintaining all of the functionality and giving you the ability to be able to extend it in the future however you would need. Um, really, ideally, uh, we'd like you to not be blocked by the source code. And so what I mean by that is if you ever needed to make a minor change to the visuals, or if you ever needed to aggregate some other form of data or onboard a new instrument, ideally, you could just write a simple configuration file or a couple of lines of code, and then it would be plug-and-play from there. And so that's kind of where we're basing all of these different ideas. Um, and I did have-- I do have a small prototype here that kind of showcases what I mean by that. And so this here is, uh, what we're calling a layout preset. And so basically, presets are our way of configuring these different views. They allow you to put different graphs together to be able to show different types of information, and they, they give you a way to display data that you're capturing or that you've already recorded. And so essentially, we're moving this away from being locked into the source code to allowing you guys to be able to build, uh, build or edit any kind of template that we would provide. And we would go ahead and-

**Asaph** `00:06:46`  
With the code or with this interface?

**David** `00:06:50`  
Could you clarify?

**Asaph** `00:06:51`  
Well, so would we be coding that, or you would-- we would just be simply moving around?

**David** `00:06:56`  
It's just a drag-and-drop interface.

**Asaph** `00:06:57`  
Yeah.

**David** `00:06:58`  
Mm-hmm.

**Asaph** `00:07:01`  
That seems-

**David** `00:07:02`  
Yeah. And so-

**Asaph** `00:07:03`  
... easier.

**David** `00:07:04`  
Yeah. And so this is the example. Uh, in this particular preset, this is actually using some of the live data that you capture from ambit. And if I run a demo here, um, you can go ahead and see that. That's sort of more or less what it would look like whenever we get it to you. There's still a, a lot of details and changes to be made in, in how the application looks and how it works. Um, and then, of course, more importantly, your feedback on what you would need and what you would like.

**Diego** `00:07:30`  
Yeah, that's cool. [laughing] Like, would that require more, like, computer power?

**David** `00:07:38`  
No. So it would actually run faster than the existing program-

**Diego** `00:07:43`  
Oh

**David** `00:07:43`  
... because we would be able to make the necessary separations in the software to optimize that.

**Asaph** `00:07:49`  
Hmm. So let me just make sure. So for the ambit, this seems nice. Um, if we were gonna do this for the existing modules, um, all the features that we have in there, all the calculations, all that would be retained?

**David** `00:08:04`  
Right.

**Asaph** `00:08:05`  
So that we would not have to kind of go back to the, the drawing board with that. And then we could then integrate this type of feature for the ambit on top of at least one or more of those modules. Is that-

**David** `00:08:18`  
That's correct, yeah. And I, and I believe I actually have, um, presets already made for some of the existing modules. So here's module two, for example. And the layout is not as nice, but this is just to showcase sort of what's possible and how we can do it, right?

**Asaph** `00:08:33`  
Okay.

**David** `00:08:34`  
Of course, we'd tune this and, and we'd make the layout a lot nicer.

**Asaph** `00:08:42`  
Yeah. I mean, I think that if, um... I mean, I trust you in terms of this would be easier to use. Can you kinda, like, explain how we might be able to modify this? Like, what-- how would that look?

**David** `00:08:57`  
Sure. So it might be easier to show you with the original layout here. But essentially, all you would have to do is, is you would have to click into this tab, and then you would have the ability to add brand-new components based on what you want to display. You would be able to add in components that let you control the instruments and coordinate stop and start times for your captures. Um, and you would also be able to just simply resize these to, to fit whatever your needs are. Um, and if you need more features or if there's something that we have here that, that doesn't quite fit your use case, we can, we can also, you know, add that. This isn't set in stone.

**Asaph** `00:09:33`  
Yeah. Cool. Let's try it. So what do you-- what's your thoughts in terms of doing this? Like, would it be best to take one of the modules, update that with this new system, and then test it, and then sort of build in... Well, yeah, integrate in the other modules, um, and then build in the, the ambit as well?

**David** `00:09:56`  
Yeah. So as a baseline, um, we'd go ahead and just essentially rebuild the existing software and then build on top of that once we know that it, it is-- it behaves exactly the same as the, the legacy software.

**Asaph** `00:10:08`  
Okay. Yeah, sounds great. I mean, it's kind of mind-blowing that we had the lab view for fifteen years, and now we have this new software, and you're al-already calling it legacy. [laughing]

**David** `00:10:22`  
[laughing] That's, that's the way it works, yeah. [laughing]

**Asaph** `00:10:25`  
And we haven't even tested the new software. Um, all right. So would there be one system then that would run all three modules?

**David** `00:10:34`  
Yeah. It, it would be unified.

**Asaph** `00:10:35`  
Yeah.

**Ethan** `00:10:37`  
Uh, we did notice that module four is purely for taking, uh, existing capture data, I think from whichever mass spec outputs the hex data.

**Asaph** `00:10:46`  
Yeah, I think we only need modules one, two, and three. So module four was integrated, uh, into the other module. Uh, let me see. Um, it was integrated into, I think, module three. I can't remember. Um...

**Ethan** `00:11:00`  
All right.

**Asaph** `00:11:00`  
Because one module is the one that Clint Song had primarily been using, right, that had Rubisco and had the discrimination on there.

**David** `00:11:08`  
Right.

**Asaph** `00:11:09`  
Um, the second module, I think, was what we referred to as carbonic anhydrase, and it had, like, um, masses forty-nine, forty-seven, forty-five on there. And then the third module was the one that we were just looking at, um, I believe, and that's the one that, um, we want to be able to make this ambit software, uh, connected to. The fourth module was just, um, allowing us to access the data from the other mass spec. And that was integrated into modules one and three, I believe. So it's probably not even in module, um, two.

**Ethan** `00:11:46`  
Yeah, when I was loo-- reviewing the source code, I didn't see the timeline on that. What I thought had happened was you guys were able to take hex data from the second mass spec, and then you still wanted a dedicated application for converting old data?

**Asaph** `00:11:59`  
Yeah. No, I think, um... So if, if you don't mind just double-checking, check module two, but I don't think it has that hex data conversion because that mass spec doesn't have the capabilities for those measurements.

**Ethan** `00:12:15`  
So, mass forty-eight, mass forty-nine, those sort of measurements, you said that the first mass spec you have can't do that?

**Asaph** `00:12:23`  
Well, um, it can. I think the first one can pull any, um, of those masses.

**Ethan** `00:12:30`  
Okay.

**Asaph** `00:12:30`  
I don't know. Do you have that module? Can you pull that one up?

**David** `00:12:34`  
You're referring to module two?

**Asaph** `00:12:35`  
Uh, module one. Let's just-- Maybe if you can, let's just make sure we're all on the same page.

**David** `00:12:40`  
Sure. One second. It's this one. These take a while to boot up for some reason.

**Ethan** `00:12:59`  
Does it normally take this long to boot up when you guys use the same software?

**Asaph** `00:13:04`  
Yeah, I think so. Um, I mean, this is the executable that, that was in there. Yeah.

**David** `00:13:10`  
Yeah.

**Asaph** `00:13:10`  
It usually takes a little bit, I think, right, to, to start it because it runs some script and then the, um, then the user interface comes up, but it's usually not quite this long.

**Diego** `00:13:22`  
Yeah, it's not that long.

**Asaph** `00:13:24`  
Yeah. So this is module one, right? And so this one also has the other window, is that right, behind it?

**David** `00:13:30`  
Um, from the, the prototype that I'm mentioning?

**Asaph** `00:13:33`  
Um, no, the, um-- There was a discrimination window on here, I thought. Um...

**David** `00:13:43`  
Yeah, that's about it.

**Asaph** `00:13:45`  
There's not another tab? Can you scroll up to the top real quick? Is there a tab up there that you can click? No.

**David** `00:13:52`  
No, there's not.

**Asaph** `00:13:53`  
See, the-- I think this might not be the latest version.

**David** `00:13:58`  
Hmm. And then you might, you might have more up-to-date code because this is, this is what we were given.

**Asaph** `00:14:02`  
Okay. We can look at the one upstairs and just double-check.

**Ethan** `00:14:06`  
Yeah.

**Asaph** `00:14:06`  
Um, could you open up, um, module two?

**David** `00:14:10`  
Sure.

**Asaph** `00:14:13`  
Okay, so this... Oh, wait.

**David** `00:14:15`  
Oh. There we go. Oops.

**Asaph** `00:14:20`  
All right. This is the one you use, right, Diego?

**Diego** `00:14:23`  
Um, yes. I mean, the one that I have in, uh, right now.

**Asaph** `00:14:31`  
Yeah. Okay. Could you show me module three? I wanna make sure we're... Yeah. So this is the one that, um... So can you pull an acquisition from this? Like, go to the file and go to the drop? Okay. Yeah. So for this one, uh, you can't pull data from the EZ View, right? Because if you notice, like, if you don't mind me just canceling this.

**David** `00:15:11`  
Sure.

**Asaph** `00:15:12`  
Uh, and then go back to file. [clears throat] You see it only says calibration or acquisition folder. Whereas if you go to module one or two, you go to file, it says select acquisition folder, which is grayed out at the moment, um, or it says select EZ View data file. So I think it's only modules, um, one and two that work on the blue, on the older mass spec. We'll call it the A-Lab mass spec. Because they have this EZ View data file acquisition. The other one doesn't have it and doesn't need it.

**David** `00:15:56`  
Okay.

**Asaph** `00:15:56`  
It's okay if it has it, but it doesn't need it.

**David** `00:15:59`  
Sure.

**Ethan** `00:16:07`  
Just out of curiosity, I didn't see it documented. Do you know the sample rates for your two mass spectrometers?

**Asaph** `00:16:14`  
Um, you mean how quickly the data is pulled in, um, or how quickly it's stored?

**Ethan** `00:16:21`  
How many just samples per second, like when you're feeding gas into it?

**Asaph** `00:16:26`  
Um, yeah, that's a good question. I think that, um, the mass spec in the, in the little room, I think is, um, like every couple of milliseconds, uh, it's pulling in data.

**Ethan** `00:16:42`  
All right. And then give me just a second. The old one is the one in the big room?

**Asaph** `00:16:47`  
Yeah, the old one's the one-

**Ethan** `00:16:47`  
And that's the one you're referring to as A-Lab?

**Asaph** `00:16:49`  
Yeah.

**Ethan** `00:16:53`  
Okay. And then the bigger mass spectrometer in the small room?

**Asaph** `00:16:59`  
Yeah, that's the one that's pulling every couple of milliseconds. Um, and then the one in the A-Lab, I'd have to go back and look, but there should be a timestamp, um, on that data coming in, um...

**Ethan** `00:17:12`  
Oh, yeah. We probably could have checked that. [laughs]

**Asaph** `00:17:15`  
Yeah. And I think, um, the thing with the one in the, um, the newer mass spec, the one that's in the little room, um, it's actually taking an average. So I think we get data every couple of milliseconds, and it's, um, taking an average, so I think we get it every like ten milliseconds or something like that.

**David** `00:17:35`  
Mm-hmm. Yep.

**Ethan** `00:17:37`  
Cool. Just trying to figure out what requirements we need for the new software in terms of how much data it has to be able to pass.

**Asaph** `00:17:44`  
Okay. And it's okay to, I think, take running... I mean, we don't need that level of temporal resolution.

**Ethan** `00:17:51`  
Yeah.

**Asaph** `00:17:52`  
So it's okay to take running averages if that helps, uh, with the data processing.

**Ethan** `00:17:58`  
No, I think we'll be fine. Every few milliseconds is not a lot of data. [laughs]

**Asaph** `00:18:02`  
Okay.

**Diego** `00:18:03`  
Uh, I think in the old, the one that is in Lab A, like what they did, it was that they... Because they are assuming there is a linear, so basically they're taking two points and then there are, you know, a correlation just to find the middle point between those two. I think that's how- ... store in the Excel, not the average.

**Asaph** `00:18:26`  
On the input data or in the-

**Diego** `00:18:27`  
No, no, no. In the master data. Yeah, that's how they remember it.

**Ethan** `00:18:32`  
Yeah, what I saw was they're taking the hex stream and parsing it into, like, individual, like, groups of ten or so samples. Then they're averaging all of those and then just sending a single data point to the graph from all ten of those.

**Asaph** `00:18:45`  
Okay.

**Ethan** `00:18:48`  
So...

**Asaph** `00:18:48`  
And that hex code, are there multiple channels of data, right, that are coming in?

**David** `00:18:52`  
Right.

**Ethan** `00:18:52`  
Yeah.

**Asaph** `00:18:52`  
Okay. And we're only pulling a couple of those channels, right, into the...

**Ethan** `00:18:58`  
I think so. I don't remember the exact... Uh, they had notes about certain channels being switched and certain channels not being used at all.

**Asaph** `00:19:04`  
Okay.

**Ethan** `00:19:04`  
So that sounds about right. But we can keep that in your new software as well.

**Asaph** `00:19:09`  
Okay.

**David** `00:19:11`  
For the amount of data that you're storing, um, truthfully, it really is up to you how much granularity you want. You're, uh, a full capture at about eight hours, um, whenever I ran the numbers, it's really only a couple of megabytes, so it's insignificant to the program. So it's really whatever you guys need.

**Asaph** `00:19:29`  
Okay. I mean, the better the resolution, uh, the higher the resolution, the better. Uh, I think we just don't want to get things too pixelated. Like, we wanna be able to... And we're averaging over, you know, seconds anyways, right? Because we're usually... Because we're dealing with, you know, biological processes, it takes time for things to, to happen and change. But we also want to be able to see if there's noise on the instrumentation itself.

**David** `00:19:57`  
Mm-hmm.

**Asaph** `00:19:57`  
And if that noise is too great, then we have to figure out how to dampen that noise.

**David** `00:20:02`  
Okay.

**Asaph** `00:20:03`  
So I think, um, I would say let's start with the highest resolution as possible. I think part of the problem we ran into previously is that there was... Well, because we're oftentimes calling data from one computer to another computer, like, if it would ask for data and it wasn't there, like, the software would crash.

**David** `00:20:21`  
Yeah.

**Asaph** `00:20:22`  
Um, and so we, we put in a fair bit of time trying to, um, optimize that. I really am concerned that you guys are not maybe using the most up-to-date versions, uh, or this, these might not be the most up-to-date versions of-

**Ethan** `00:20:36`  
Do we wanna head up to the lab and just take a look?

**Asaph** `00:20:38`  
Yeah, let's do that.

**Ethan** `00:20:39`  
Okay. [footsteps] [door closing] 'Cause that would be interesting if we don't have the most up-to-date versions. [door opening]

**Asaph** `00:20:59`  
So how do you, um... During this class, um, you guys get to choose what group or what project you work on?

**Ethan** `00:21:07`  
We get to rank them. I think we give each project a score of one through five, five being the one we most wanna work on.

**Asaph** `00:21:14`  
Okay.

**Ethan** `00:21:14`  
And then, uh, Pe- Partik does his best to accommodate all of those.

**Asaph** `00:21:20`  
And you, um... Are they all WSU groups that-

**Ethan** `00:21:26`  
No.

**Asaph** `00:21:26`  
The students-

**Ethan** `00:21:27`  
They're from all over, uh, various companies, startups. A handful of them are from Wazoo Laboratories.

**Asaph** `00:21:35`  
So what's the downside of, or is there a downside of working with somebody at WSU versus a startup or a company?

**Ethan** `00:21:42`  
I've never worked with a startup, but I really like just being able to stay local to campus.

**Asaph** `00:21:47`  
Yeah. The other ones, you would have to travel to or do all remotely?

**Ethan** `00:21:53`  
I've honestly got no idea. This, uh, this lab was actually one of my top choices just 'cause everything else involved trying to integrate LLMs into existing software, and I wasn't a big fan of that.

**Asaph** `00:22:05`  
Yeah.

**Ethan** `00:22:06`  
And I've done or designed some projects in the past related to, like, algae growth.

**Asaph** `00:22:13`  
Cool.

**Ethan** `00:22:13`  
So...

**Asaph** `00:22:14`  
All right. So-

**Diego** `00:22:14`  
So this is the most foundational.

**Asaph** `00:22:17`  
So this is, um... Okay, so this is the module, um, two, right? [machine whirring]

**Diego** `00:22:28`  
Yeah, it says these three masters, two, four, four.

**Asaph** `00:22:33`  
But what it doesn't have is it doesn't have the, um, you know, the, the sliding bar on there. It's just the...

**Diego** `00:22:41`  
Yeah, because this one we take away from the... [microphone rustling] The speed up and...

**Asaph** `00:22:49`  
So usually, um... [machine whirring] [keyboard clacking] So... [keyboard clacking] This is, uh... [keyboard clacking] Inside. Um, but we can check the other ones too on the other machine. It'd be good, I think, for us to maybe put all the other ones that we're not using in a... And I know you know, but, you know. Yeah, let's look on the other machine. [machine whirring]

**Ethan** `00:23:38`  
Is there any reason that you're using two separate machines for each workstation?

**Asaph** `00:23:42`  
Yeah, just so... I mean, mostly so we're running simultaneously.

**Ethan** `00:23:46`  
Okay.

**Asaph** `00:23:51`  
Well, and, um... [machine whirring] I gotta go to passwords. [machine whirring] So this is module one. And it looks like it has a made date of five one twenty-six. I don't know if that's, um, something that you guys wanna try. Could you let me know why you choose to use, um, these EasyDOSE? Um, what do you mean by that?

**David** `00:24:30`  
What, uh... I mean, is it the only way to accomplish the tasks that you're doing, or is there a convention that you're using? Why, why does it have to be that file convention?

**Asaph** `00:24:40`  
Easy View?

**David** `00:24:40`  
Mm-hmm.

**Asaph** `00:24:41`  
Um, well, so this machine here doesn't use Easy View. The other one does. Uh, and Easy View is, um, software that comes with, uh, or came with that mass spec for us to be able to pull the data. So basically what it is, is there's a, a s- a split in the data stream. One goes to the computer that controls the mass spec, and then Easy View is able to also view the raw data as it comes out of that, uh, hard rock cable.

**David** `00:25:09`  
Gotcha.

**Asaph** `00:25:10`  
So we don't have to use it, but that was what the company suggested would allow us to at least see the raw data coming, um, from that. And so then we coupled that to, to the lab use, or sorry, the, the Python script. So if we get, get away from using that, that's fine too. Um, so yeah, this is module one, and you can see again, it's not quite the same, uh, setup. And it has... If you go up here, this is the plots, and then there's another tab up here that allows us to do... So I'm surprised that whatever's on the GitHub is not the most updated version, but, um, I can double-check what I have as well.

**David** `00:25:55`  
Yeah. The one we have is a couple of years old. I'm not sure how old this one is.

**Asaph** `00:25:59`  
This would have been, um... They would, they would have finished up in May, essentially, of '26.

**David** `00:26:04`  
Yeah, I know. We don't have it.

**Asaph** `00:26:06`  
Okay.

**David** `00:26:06`  
You have the source code.

**Asaph** `00:26:08`  
Okay, yeah. Uh, let me, um, let me figure out how to get to, like, get, get the Python script.

**Ethan** `00:26:14`  
Maybe it was... Did we check if the repo we forked from had different branches other than main?

**Asaph** `00:26:20`  
It's not from what I recall, but we can double-check.

**Ethan** `00:26:22`  
All right. Uh, just to, just to get your opinion on this, we could set up an update system where instead of us emailing you EXEs or anything like that-

**Asaph** `00:26:33`  
Yep.

**Ethan** `00:26:33`  
-the software itself could say, "Hey, there's a new version available. Do you want to try it?" Uh, and if, say, the new version is broken, you could easily revert back to your old one, just so you can see changes as they're happening. Is that something you would be interested in?

**Asaph** `00:26:46`  
Uh, I think so. Just to make sure I understand, um, like, we need to have a operational version always, right?

**Ethan** `00:26:52`  
Yeah.

**Asaph** `00:26:52`  
So we don't wanna update if you guys are playing, right?

**Ethan** `00:26:55`  
Yeah, no. We'll only be pushing functional versions to you that function like on our machines. As far as we're aware, they work.

**Asaph** `00:27:02`  
Yep.

**Ethan** `00:27:03`  
Uh, and then you would always have the ability to revert back to the version you were using.

**Asaph** `00:27:07`  
Okay.

**Ethan** `00:27:08`  
So...

**Asaph** `00:27:08`  
Um, I think that might be good. It might be nice, though, to have, like... Let's leave this one alone. This will be our working one for now, and then we could have one that you guys are updating and modifying, and then we could test in real time, uh, and then just make sure that, um, we're not disrupting people's workflow. Because oftentimes, this is pretty heavily booked, um, and I'd hate for somebody to get on it and then be frustrated because they don't have a interface that they can use.

**Ethan** `00:27:35`  
Sure.

**Asaph** `00:27:36`  
Yeah. So yeah, I think we could do that.

**Ethan** `00:27:39`  
All right, cool. Uh, I think that's pretty much everything I had for questions.

**David** `00:27:46`  
Um, yeah. Ano-another thing that we could do, I noticed whenever I was talking to you, um, the last time that we met, you mentioned that you guys are having to move information across machines in order to do your calculations. What we could do is we could provide you a unified view so that you're able to run the analytics that you want in the same software.

**Asaph** `00:28:05`  
Yeah.

**David** `00:28:05`  
Is that something that you guys would be interested in?

**Asaph** `00:28:07`  
I think depending on what specifically you're talking about. Um, like, what, what were you seeing that Diego was doing that was...

**David** `00:28:14`  
Uh, there was a lot of Excel work, right?

**Asaph** `00:28:17`  
Yeah.

**David** `00:28:17`  
Yeah, you mentioned that you pull information and that then you do some calculations outside in Excel.

**Asaph** `00:28:23`  
Yeah.

**David** `00:28:24`  
Yeah. But, uh, as far as the software is concerned, um, it would just be able to do any generic type of calculations. You could essentially run SQL or Python or R on the, on the existing software. And so, uh, from our point of view, you could do essentially anything that you want.

**Asaph** `00:28:42`  
I think, um, I think so. I think, uh, the only caveat would be trying to capture what it is everybody's doing with the data and whether or not everybody's doing the same thing, you know, change. So if there's flexibility in that, then I think that would work fine. So it might be we have to just, uh, get a list of the things that people are doing with the data downstream, and then once we have that, we'd be able to, um, yeah, be able to help you code that up. I mean, a lot of what we're doing is, um, ultimately, you know, creating graphs and, you know, for presentations and things like that.

**David** `00:29:19`  
Right.

**Asaph** `00:29:20`  
So we'll take it from Excel into another, usually into Python or R to, to do plots and things like that.

**David** `00:29:26`  
Right. Okay. Yeah.

**Ethan** `00:29:29`  
Uh, could you repeat that for me one more time so I can get it in my notes?

**David** `00:29:32`  
Um, essentially adding an analytics feature to the software.

**Ethan** `00:29:40`  
Because you mentioned something about switching data between PCs. Uh, the only reference I recall about that is them moving it from the mass spec control PC to the one that's actually running the software.

**David** `00:29:50`  
Yeah. It was from the, from the last time that I was here, I know, with Diego.

**Ethan** `00:29:53`  
Oh.

**David** `00:29:53`  
He mentioned that his workflow was cap-- uh, grabbing information from-- captured from the mass spec and then from Ambit and then moving them into, like, a unified extension.

**Ethan** `00:30:00`  
Got it.

**David** `00:30:01`  
Yeah.

**Ethan** `00:30:02`  
Do you guys ever have a reason to move data from one of these computers to the one out there?

**Asaph** `00:30:07`  
Not really, no.

**Ethan** `00:30:08`  
Okay.

**Asaph** `00:30:10`  
Not that I'm aware of, at least. I mean, mostly what we're doing is we're pulling data that gets captured in these tables into an Excel file. Um... Let's just... Yeah, we're- Pulling raw data out for, for some reason, uh, and then using that to make some plots, um, because we're combining data sets, essentially.

**David** `00:30:37`  
Yeah.

**Asaph** `00:30:37`  
Um... Yeah, I think if we're, um... As long as we're able to communicate to you what we want to be able to program, then you can spit it out.

**David** `00:31:01`  
Sure. And you, and you'd still have the same capabilities as you do now.

**Asaph** `00:31:05`  
To export the data.

**David** `00:31:06`  
To export as a CSV or whatever file format that you need. Just let us know, and we can do that.

**Asaph** `00:31:11`  
Okay. Cool. That's great. So, uh, in terms of timeframe, what do you... Like, what's your proposed-- what should we do next, or what else do we need next?

**David** `00:31:22`  
Um, it depends on what you need immediately. Um, do you need to be able to use AMBIT in the software as soon as possible, or what's your timeframe?

**Asaph** `00:31:32`  
I think so, right? I mean, we'd like to get the AMBIT, uh, integrated and controlling as soon as possible. Uh, so I think that would be... Like, maybe, you know, the upgrades that you're talking about for the other modules, maybe... I don't know how it's best for your workflow, but I think it would be great for us if we get the AMBIT integrated into the existing platform and then update everything after we're proposing into, um, like, a new interface.

**David** `00:31:57`  
Sure. So essentially, what it looks like, I mean, there, there's two different paths. There, there's a path where what we would have to do is we'd have to consolidate all of the different executables because they're sharing a lot of code, and so two people can do it, two people can work. That'll take a few weeks. Um, and then we could build onto the existing software as it is now with the AMBIT requirements. Um, alternatively, we could start doing work on, um, the rebuild, and then we could get that in about a month and a half or two if we just focus on that. But-

**Asaph** `00:32:28`  
As the AMBIT or the rebuild of all three modules?

**David** `00:32:30`  
The rebuild of all three different modules.

**Asaph** `00:32:33`  
Okay.

**David** `00:32:33`  
Uh, the trade-off is that if, if we maintain the older software, you're gonna get the newer one a lot later.

**Asaph** `00:32:40`  
And we maintain... Oh, you mean with putting the AMBIT connected to the newer soft-- or the current software?

**David** `00:32:46`  
Yeah.

**Asaph** `00:32:46`  
Right. Yeah. Um, I don't know. What do you think? I mean, right now you're functional, right? Having the AMBIT and the...

**Ethan** `00:32:55`  
Yeah.

**Asaph** `00:32:56`  
More or less. Um, yeah. I, I think it's up to you. Whatever you think is the most, uh, streamlined effort. Uh, if you can build up the new system and then integrate the AMBIT, I think that's probably... All right. I'll go with that.

**Ethan** `00:33:13`  
And then as far as the changes we've made regarding line color and line size, once we figure out where the newest version is, we could integrate that and send it to you so you have those changes immediately.

**Asaph** `00:33:22`  
Okay. Yeah, that sounds good.

**Ethan** `00:33:24`  
Uh, in terms of our next meeting, we've gathered, I think, pretty much all of the requirements we need, so it'll mostly just be us showcasing, um, the progress we've made. And we don't really have a timeframe for that.

**Asaph** `00:33:36`  
Yeah.

**Ethan** `00:33:38`  
But-

**Asaph** `00:33:38`  
So just to make sure I understand. So if you were gonna just make a mockup, or not a mockup, but take the existing, uh, module and connect the AMBIT to one, it would take you a couple of weeks to do that?

**David** `00:33:50`  
With the exception of you only wanting to have access to AMBIT in a single module.

**Asaph** `00:33:56`  
Yes. That would be just one module that we would have.

**David** `00:33:58`  
Which module would you want?

**Asaph** `00:33:59`  
It's, um, the ones out there. Module two.

**Diego** `00:34:02`  
This, two.

**David** `00:34:02`  
Module two?

**Asaph** `00:34:03`  
Yeah.

**David** `00:34:03`  
And we have the, the latest for module two?

**Asaph** `00:34:04`  
No.

**Diego** `00:34:05`  
I don't think so.

**Asaph** `00:34:05`  
No, I don't think we need to get you the latest module.

**David** `00:34:08`  
Yeah, if we can get the latest from module two, we could, we could probably start working on both pieces of software at the same time.

**Asaph** `00:34:13`  
Okay. And I think that would be helpful for Diego if he could have that integration of the AMBIT with module two, um, while you guys are kind of working in the background to integrate all three systems, as long as it doesn't double your work.

**David** `00:34:27`  
It does, but it doesn't change anything.

**Ethan** `00:34:29`  
And besides, the changes as you mentioned them, like, if we just integrated AMBIT into your software entirely, like, as you said, it'd take a month and a half, two months. Uh, this project is supposed to take us a whole year. [laughs]

**Asaph** `00:34:40`  
Yeah, so you got some time. Yeah, so the end product would be this new platform with AMBIT integrated and all the new bells and whistles on that end.

**David** `00:34:47`  
Okay.

**Asaph** `00:34:48`  
So let's say... Yeah, let's try and get the, let's say the AMBIT done by the end of the semester, AMBIT integration into the current platform module two, um, and then end of the spring semester, we have everything up and running.

**David** `00:35:01`  
Okay.

**Asaph** `00:35:04`  
Yeah. With some time to test it, right?

**Ethan** `00:35:06`  
Yeah. Of course.

**Asaph** `00:35:13`  
Yeah.

**David** `00:35:13`  
And you mentioned that you only have, uh, one instrument, correct?

**Asaph** `00:35:18`  
Um, well, there's this one. There's this one and, um-

**David** `00:35:20`  
Well, I was referring to the AMBIT. You only have one instrument.

**Asaph** `00:35:22`  
Oh, yeah. There's no AMBIT, yeah.

**Ethan** `00:35:26`  
And if you were to add more instruments in the future, do you know, like, what they would be? Do you have any plans to get new instruments?

**Diego** `00:35:32`  
Like four of them.

**Asaph** `00:35:34`  
Yeah, but I think that's kind of AMBIT, right? I would say that's all integrated, right? So I would wanna... No. Yeah, we have a couple of new things that we would like to integrate. So there's the AMBIT, and then there's something called the Porgo.

**Ethan** `00:35:46`  
Yeah. How do you spell that?

**Asaph** `00:35:48`  
P-O-R-

**Diego** `00:35:50`  
J-M-

**Asaph** `00:35:52`  
G-O, right?

**David** `00:35:53`  
Porgo.

**Diego** `00:35:54`  
Go. Hey, go. [laughs] Go. Yeah. Put a, another O here between the R and the G. Porogo.

**Ethan** `00:36:01`  
Okay. 'Cause my plan is, like, we're going to design your platform to be as... How-- What's the word? Modify-- Not modify.

**David** `00:36:10`  
Extensible?

**Ethan** `00:36:10`  
Extensible. There we go. As extensible as possible. The best way we can do that is to just get an idea of ways it'll have to be changed in the future.

**Asaph** `00:36:17`  
Thank you.

**Ethan** `00:36:18`  
So if you think of any other instruments you wanna integrate, I can't promise we'll integrate them, but we'll just set it up while we're over there.

**Asaph** `00:36:24`  
So that you guys can do the next group thing.

**Ethan** `00:36:26`  
Yeah.

**David** `00:36:26`  
That sounds great. In a perfect world, you, you would be able to set up any kind of acquisition mode that you want to do on your own without someone having to touch the software. That's our perfect vision.

**Asaph** `00:36:38`  
All right. You have, uh, high expectations on our abilities. [laughing] That's great. Yeah, but I think the Ambit and the Porgo would be the, the two sort of moving forward.

**Ethan** `00:36:49`  
Okay. Cool.

**Asaph** `00:36:49`  
And maybe that would be a good test. Like, you get the Ambit integrated into the new platform, and then we will work with you to try and get the Porgo, uh, integrated, and we should be able to do that then. If it, if it works the way you say, then we should be able to help you.

**Ethan** `00:37:04`  
And is that by the same company that makes the Ambit?

**David** `00:37:06`  
Yeah.

**Ethan** `00:37:18`  
Okay. Cool. I think that's everything on my end.

**David** `00:37:19`  
Yeah, I think, I think we're doing all right.

**Asaph** `00:37:21`  
Sounds good. So, um, maybe just keep us updated by email, and we can decide, like, when to meet next.

**Ethan** `00:37:27`  
Yeah.

**Asaph** `00:37:27`  
Yeah. In a week? Sounds good. Yeah. I think, um, you guys have sort of reports that you have to do, right, for class?

**Ethan** `00:37:36`  
Yeah.

**Asaph** `00:37:37`  
All right. Gotta keep you focused and keep you going.

**David** `00:37:41`  
Yeah.

**Ethan** `00:37:42`  
Oh, uh, we did wanna float the idea. You mentioned potentially giving ASAF access to our current repository.

**David** `00:37:48`  
Oh, yeah. That's right. Um, we want to... So, so right now, the way that it's done is, it's-- there's a student who's graduated who owns all of the source code. Ideally, we'd like to give you access to all of it so that you can have insights into what's going on. And so, also, in, in case there's ever, for some reason, a failure on the machine, you can easily pull, uh, the executables without having to email anybody for it.

**Asaph** `00:38:11`  
Yeah.

**David** `00:38:12`  
That's something that we were thinking about doing for you. Is that something you guys would be interested in, or do you guys not wanna-

**Asaph** `00:38:16`  
So what do you mean there's one student who owns? He owns the GitHub-

**David** `00:38:21`  
Yeah

**Asaph** `00:38:21`  
... application?

**David** `00:38:22`  
Quite literally, it's, it's posted on the internet for everyone to see, and he's the owner of it. We just copied it, and now we're working on top of it.

**Asaph** `00:38:29`  
Okay.

**David** `00:38:30`  
But we wanna give you access to the original source code.

**Asaph** `00:38:35`  
Yeah. Um, that would be great. Um, I thought we had sort of mirrored whatever, um... Can't remember the student's name. Do you remember his name? No. Um, I thought we basically just cloned whatever he had, and we were working off one that was actually tied to WSU. Um...

**Ethan** `00:38:54`  
I can grab my laptop and show you what we're working with.

**Asaph** `00:38:56`  
Okay.

**David** `00:38:57`  
Yeah. Right now, we're just basically cloning.

**Asaph** `00:39:16`  
Okay. I will, um... I don't have my laptop with me, so I can't access it, but I can... I should be able to pull that up.

**Ethan** `00:39:28`  
I'm gonna grab mine.

**Asaph** `00:39:29`  
Yeah. Let's see what you got.

**Ethan** `00:39:44`  
So this is our current repository. Uh, we forked it from this one, which is why we're surprised that we don't have the latest software, 'cause we thought this was the repository for it.

**Asaph** `00:39:54`  
Yeah.

**Ethan** `00:39:55`  
But this isn't through Wazoo. It's just through our kind of-

**Asaph** `00:39:59`  
Yeah. Kyler, so he was... This was the last group. I can't remember. Maybe it was two groups ago. Let's-- If you don't mind, let's go to my office.

**Ethan** `00:40:10`  
Yeah.

**Asaph** `00:40:10`  
Let's see if I can pull this up.

**Ethan** `00:40:12`  
Right. Oh, wow. Look at that.

**Asaph** `00:40:55`  
Yeah. See, you know, that's about all I can do. Uh, let's see. Let's see. [keyboard clicking] So the problem is, sometimes this happens. So there's this one, I think, is the one that you guys were just showing me, right?

**Ethan** `00:42:26`  
Right. That's the one.

**David** `00:42:27`  
Yeah.

**Asaph** `00:42:28`  
Yeah. Um, and there's this And these are the modules here, one and two, that you pulled?

**David** `00:42:53`  
That's right, yeah.

**Asaph** `00:43:01`  
Yeah, let me do some digging, um, because the def-- it definitely looked like, um, the modules that you were showing us were different than what it was down-- or that was up here.

**David** `00:43:14`  
Um, so I did build the application on macOS. It could be-- it could potentially require-- some, some of the dependencies in the modules could require Windows. So I could take a look with a Windows machine, and then maybe they would, uh, show up the way that you view them.

**Asaph** `00:43:30`  
Okay.

**David** `00:43:30`  
But I'm very doubtful.

**Asaph** `00:43:31`  
Okay. Does it-- Am I able to see, like, when these were last built?

**David** `00:43:37`  
Yeah. Yeah, it, it says right there on the last commit date.

**Ethan** `00:43:45`  
Uh, it doesn't say.

**Asaph** `00:43:47`  
Okay, but it doesn't actually say there.

**Ethan** `00:43:48`  
If you click on that, the, uh, comment hash, it might give you an exact date.

**Asaph** `00:43:53`  
Okay.

**Ethan** `00:43:53`  
April seventh, twenty twenty-five was when that one was last changed, so.

**Asaph** `00:43:58`  
Yeah, so that, that would be two years ago. So I think we're missing one somewhere. Um, and I think the other one... Yeah, let me look at some emails, and then I can try and forward them to you guys.

**Ethan** `00:44:10`  
Cool. Thank you.

**David** `00:44:11`  
Okay, cool.

**Asaph** `00:44:16`  
Yeah, 'cause I think Tyler was two years ago. Um, what's the name of the, the class? Like, what's the, um, the number?

**David** `00:44:27`  
Uh, four twenty-one.

**Asaph** `00:44:28`  
Four twenty-one?

**David** `00:44:29`  
Yeah.

**Asaph** `00:44:33`  
Yeah, it's not gonna be a good search. All right. I'll do it later, um, and I'll get it to you guys.

**Ethan** `00:44:41`  
All right, cool.

**David** `00:44:42`  
Okay.

**Asaph** `00:44:43`  
Yeah, 'cause it should have been one from twenty twenty-five and twenty twenty-six, um, academic year.

**David** `00:44:49`  
Okay. Yeah, and if you're interested, um, we could also help you set up the repository so that anytime someone wants to come in and make changes to your code, you just add them as a collaborator, and, uh, changes from throughout the years will always be there.

**Asaph** `00:45:01`  
Okay. Yeah, that would be good. I-- For some reason, I thought that's what we did have, but, um, maybe we didn't have it.

**David** `00:45:09`  
Yeah, let me just write that down.

**Asaph** `00:45:17`  
All right, awesome. Anything else for you guys?

**David** `00:45:21`  
Uh, I think that covers everything we've got.

**Asaph** `00:45:23`  
Okay.

**Ethan** `00:45:23`  
All right.

**Asaph** `00:45:24`  
Cool. Well, I was a little hesitant for you guys to come in and just start hammering away at things, but, um, I think I'm convinced it's a good idea.

**Ethan** `00:45:32`  
Cool. [laughing]

**Asaph** `00:45:34`  
Hammer away at things.

**David** `00:45:36`  
Yeah. [laughing] Let me break it all. No, I'm kidding.

**Asaph** `00:45:39`  
Well, and again, we'll have a backup, right? So-

**David** `00:45:42`  
Yeah, of course.

**Asaph** `00:45:42`  
-we can hammer away, so cool. Cool. All right. Well, thank you, guys. Appreciate it.

**David** `00:45:47`  
Yeah, absolutely. Thanks for seeing us.

**Asaph** `00:45:48`  
Yep. Take care.

**Ethan** `00:45:50`  
Yeah. Have a nice night.

**Asaph** `00:45:51`  
Yeah, you too. [machine whirring]
