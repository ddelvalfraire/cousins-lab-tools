# Asaph Meeting Transcript

Source: `Asaph meeting transcript.m4a`  
Duration: 01:04:43  

## Attendees

| Name | Role | Talk time | Turns |
|---|---|---|---|
| Asaph | Professor, lab lead | 00:43:57 | 215 |
| Kuenzang | Lab researcher | 00:08:10 | 92 |
| Ethan | Student team | 00:05:12 | 134 |
| David | Student team | 00:03:13 | 80 |
| Diego | Lab researcher | 00:00:11 | 6 |

## Transcript

**Diego** `00:00:00`  
In data acquisition, it's mostly in, um, data frame.

**Asaph** `00:00:06`  
Well, um, you were very, very good. Uh, I have very little experience with Python, so I'm gonna leave it to you guys, um, for doing what you need to do. How about you guys in terms of Python?

**Ethan** `00:00:19`  
Um, I've got some experience.

**Asaph** `00:00:22`  
Okay.

**Ethan** `00:00:22`  
I'm more fluent in C++.

**Asaph** `00:00:24`  
Okay. I have at least moderate experience with Python as well. Yep. Nothing beyond. Cool. Okay. So let's, um, let's go in here. I think this might be the best way to, to get started. Um... So we have, uh, ([clears throat]) basically a couple of different pieces of equipment that, um, we are using to, uh, basically capture data and, uh, it comes off at really high temporal resolution. Like the data comes off like every, well, maybe like tenth of a millisecond, right? We're getting data that comes in. Uh, and so what we have been doing is trying to figure out ways to filter that data, um, so that we don't have to sort of process it after the fact, because it's really cumbersome to have to deal with these data sets where we're collecting over, let's say, two or three hours, sometimes longer, and we're getting that high frequency data, because it's just-- it's too much information for us to handle downstream. And so, um, there are two pieces of equipment, um, that we'll tell you about. Uh, and so this is a mass spectrometer. So, um, the mass spectrometer is a, a device that is able to measure, uh, different gases and the elemental composition of these gases, right? So it can measure-- We focus primarily on carbon dioxide and oxygen, um, and it can measure the species, but it also can measure the isotopic composition. So, like carbon comes in different weights. It comes in heavy and light, right? It also comes in radioactive, and we're not dealing with radioactive carbon. This is all natural abundance. Um, and so we are using a mass spectrometer to measure these different gas concentrations. And so, um, Diego here is a grad student in the lab. He'll tell you a little bit about, uh, another piece of equipment that we'd like to sort of bring together, integrate into what we're doing. So, um, we have two different mass spectrometers. There's one here, and there's one in the room over there. Uh, and we currently have, uh, a number of different Python scripts, or we call them modules, that, um, have been developed over the last, I don't know, maybe three or four years that I've been working with students in this class. And so, uh, this is a, uh... This has a user interface, right? That is-- doesn't look like Python, right? But behind the scenes, there's a significant amount of code that sort of builds this interface and pulls the data. So essentially what it's doing is, um, this computer here is controlling the machine, controlling the settings, et cetera. Uh, and we basically are splitting, in this case, the data, uh, coming from this mass spec so that it goes back here, so we can control the machine, but also it's dumping some of the data here so we can analyze it in real time. So, uh, I will just, um... I guess we don't have any acquisitions on this one, do we? So let me, um, let me back up. All right, this is a new one, so we'll get into later. Um... Oh, I guess I could pull up Hugo's data set. I could do that. Hey, Diego, where are the, um, the EasyView files stored?

**Diego** `00:04:28`  
Uh, Documents.

**Asaph** `00:04:33`  
Application Data?

**Diego** `00:04:35`  
Or in Test.

**Asaph** `00:04:37`  
Oh, yeah. Okay. So I'm just gonna-- These, these are data sets that have been saved previously, so I'm just going to, uh, run one of these, um, so you can see sort of what the data looks like as it's streaming. So, um, right now... Oh, this is an older one. Diego, this, this is not the newest version, is it?

**Diego** `00:05:07`  
Uh, which one do you click on?

**Asaph** `00:05:10`  
Yeah. I clicked on... Hold on. Let me stop this. I clicked on that one. Is it this one up here? That is the one I clicked on.

**Diego** `00:05:32`  
No.

**Asaph** `00:05:33`  
Okay.

**Diego** `00:05:33`  
No. I'm using that one.

**Asaph** `00:05:34`  
All right. Well, for my own sake, we should probably, uh, clean that up. And did you do a run like on the eighteenth that'll have traces that we can look at? Yeah.

**Kuenzang** `00:06:09`  
([machine running]) Well, you just let it run then until you finish it.

**Asaph** `00:06:17`  
Yeah, I kind of wanted to get-

**Kuenzang** `00:06:21`  
([machine running])

**Asaph** `00:06:36`  
The pump got shut off for some reason. All right, well, this is not a good example.

**David** `00:06:43`  
Is what you're doing a replay or a live capture?

**Asaph** `00:06:48`  
No, I was trying to do a replay'cause that was, uh... The machine's not, um, set up at the moment, so let's just try it again. So you don't, uh, do anything until it runs or until it loads completely? All right, so I'm just gonna plot it. You'll see that the data's coming in. I'm not gonna touch it until it stops'cause apparently, um, when it's not live data, stuff doesn't load. Um.

**Kuenzang** `00:07:30`  
([machine running])

**Ethan** `00:07:32`  
So I do have some questions. Um ([laughs])

**Asaph** `00:07:37`  
Good.

**Kuenzang** `00:07:37`  
Just let it run until you're finished.

**Asaph** `00:07:39`  
Yeah, go ahead.

**Ethan** `00:07:40`  
So these machines, are your experiments, are they running twenty-four/seven?

**Asaph** `00:07:44`  
No. No. They're, um... I'll let you field that. They... Uh, they're-

**Kuenzang** `00:07:48`  
I think he's asking.

**Asaph** `00:07:50`  
Um, no, we're usually running sort of, um, in the morning, you know, throughout the day. So these are experiments that would happen, uh, let's say from between, you know, 8:00 and 5:00 or 6:00 at night. So we're running them, and we're usually running for, you know, anywhere from two to four hours, something like that. And so we're able to, uh, we're able to sort of capture that window in this, in this timeframe, um, and we're monitoring it. So we're, we want this data to be live and sort of like, um, it's actively presenting us data that is happening in real time, because we need to be able to, uh, collect that data and also make modifications as we're going. So it's, it's basically, uh, it's a user interface so that we're working on it, um, actively.

**Ethan** `00:08:42`  
All right.

**Asaph** `00:08:44`  
So, um, so there's two things that the, that the system is doing. It's, it's pulling data in. It's plotting the data, right? So we either take just the raw data, the-- and it comes out as a voltage, um, or it's, uh, basically, um, doing some math on the backside to do some calibration or to implement some calibrations that we put in. So there are some calibrations that we have to do so that we can convert the raw voltage to a, a value that is interesting to us, right? Usually a concentration of the gas. And so we have calibrations, um, so you can kind of see there's some inputs here where we can run a calibration, and when that calibration is run, it will then convert the raw voltage that we get into a, a value that's, that makes sense to us.

**Ethan** `00:09:36`  
Okay.

**Asaph** `00:09:37`  
So, um, it all works despite what's happening right now very effectively, right? Uh, and so I don't know, uh, in terms of what we're thinking about, uh, at the moment that we need to make major modifications, uh, to this. We have, um, another machine over there that there are some potential calculations that we might like to upgrade to allow those, um, calculations to happen there. All right. So what you see there is basically a, a curve that's, um, or a trace of, uh, the voltage for one gas that we're measuring over time. So each one of these is, uh, basically a different experiment that we're doing. And so what's the timeframe here? It's, you know, it's about-

**Kuenzang** `00:10:21`  
A week.

**Asaph** `00:10:22`  
Well, the whole thing. It's-

**Kuenzang** `00:10:24`  
Oh, maybe, maybe four or five hours.

**Asaph** `00:10:26`  
And we only need a small fraction of this data, right? So it-- Can you zoom in on one of those? So we're usually only collecting, you know, some of the data, you know, up here and some of the data here. We have this, um, this block here that allows us to sort of zoom in or identify a certain region, and essentially what that bar will do is it'll take the average, uh, value between those two bars. And so, uh, it allows us to then, you know, basically calculate, you know, the gas concentration under these conditions versus these conditions or anywhere we put that bar.

**Ethan** `00:11:07`  
Okay.

**Asaph** `00:11:08`  
And so we also, um... This is a calibration here, right?

**Kuenzang** `00:11:14`  
I think, yeah. Might just be that.

**Ethan** `00:11:20`  
Oh, sorry. I was gonna-

**Asaph** `00:11:22`  
What's up? Yeah, come on in. I know there's a lot of... Um, and you guys should have or will have access to this, right? Did they share a GitHub folder with you?

**Ethan** `00:11:30`  
We haven't heard anything.

**Asaph** `00:11:31`  
Okay. Awesome. All right. We'll get it to you. All right. So we can run this calibration here. And so, like, when we click this button, it's basically taking the mean value, um, under these conditions.

**David** `00:11:44`  
So this calibration, is it enacting something on the mass spectrometer, or is this purely software?

**Asaph** `00:11:49`  
It's just software. Yep. I mean, we are-- Or we, Diego is manipulating the mass spectrometer by injecting known gases of a, a certain concentration, and so that allows us to run this calibration curve here. So basically, we get a very strong linear relationship between the amount of gas we inject and the, the voltage that we, um- Are measuring. So we then use that calibration to basically fit data over here. So for example, if we go here and we, uh... Where is the CO2? Oh, there. So we usually take a zero, and then we take a value here, and it'll then calculate, you know, what the concentration is. So that's five hundred microbars, right? That's basically about atmospheric concentration of, of CO2. And then if we did that-- If we do that here, and we do another calculation, now we're down at, you know, close to one microbar. So it's a much lower concentration, and it's pretty intuitive, right? High CO2, low CO2. Uh, but this allows us to get an, an absolute value. So, um, what-- I'll tell you what we wanna do, and then I think I'll tell you how I think we should get to this point being able to do this. So, uh, Diego's been using a couple of different pieces of equipment. So he's been using this piece of instrument, but we also have another, um... Well, I'll just say this is the chamber where we put our samples in that are then measured by the mass spectrometer. So this basically is pulling gas from here into the mass spectrometer and giving us that signal that we're seeing. Diego has been working with another system that's here that is actually measuring, um, the light use of that, um, of that-- We're looking at leaves, right? So light use of that leaf. So we can like shine a light on the leaf, and we can measure the efficiency in which that light is being used by the, um, the light that's being re-emitted by the leaf. And so, um, what we wanna be able to do is this is controlled by a separate Python script, uh, from this one, and the data's not integrated. So we have this massive data set where we need to, or what we'd like to be able to do, is get a, an integrated data stream. So what we're pulling from the, the gases can be basically aligned with what we're pulling from this, uh, basically this light signal that we're able to measure. So it's, um... You know, we haven't really decided what the best way to, to do this, whether or not we want to modify this program here so that it's controlling, you know, the, the light measurements, or if we want to just have the data or the system be controlled by a separate computer, but have the data then merged downstream, um, somehow. And I think a lot of that'll depend on how easy it will be for us to implement the control of this, uh, light instrument, uh, with this computer possibly. So that's where we wanna go, right? That's like the hope by the end of the semester, uh, or end of the year, is that we can get this data integration, uh, happening and potentially control of that light measuring system with the software. So I think that would be, um, one of the first steps. Or that would be like, I guess that one first step. The first step, I think, for us being able to do that is for me to give you access or, uh, maybe the best-- Because I think the class has all the data or all the-

**Ethan** `00:15:38`  
Yeah, it's there

**Asaph** `00:15:39`  
... on the GitHub. So you should be able to get that from the professor or the TA. Um, and I think that might be better because I think-- I don't wanna give you my version, so I don't want it to get corrupted by... So that would be one that I can just then copy or clone for you to play around with. And so I think what would be ideal is for you guys to just start digging into the code, and we have, I think, a pretty good, um, documentation of what the code is doing. And so I think, uh, that would allow you to sort of understand the nuts and bolts of how the program is, you know, developing the user interface, how it's pulling the data, and how it's, um, processing it. Hi, Kuenzang. Kuenzang's another one using, um-

**Kuenzang** `00:16:23`  
Yeah

**Asaph** `00:16:23`  
... uh, the software. And so, um, are you running real-time?

**Kuenzang** `00:16:28`  
Uh-

**Asaph** `00:16:29`  
Not anymore?

**Kuenzang** `00:16:30`  
I was just taking a half an hour, yeah, just before our team changed.

**Asaph** `00:16:33`  
Okay. Um, but maybe we can come in and-

**Kuenzang** `00:16:36`  
Right

**Asaph** `00:16:36`  
... yeah, show them. Um, because you also have some maybe modifications that you wanted to make, or?

**Kuenzang** `00:16:43`  
Yeah. Yeah.

**Asaph** `00:16:44`  
Okay. So I-

**Kuenzang** `00:16:45`  
([unintelligible])

**Asaph** `00:16:46`  
Okay. So yeah, I think that there may be some tweaks to the program that we wanna, uh, you know, make as well. Uh, yeah, go ahead.

**Ethan** `00:16:54`  
So in terms of experiments-

**Asaph** `00:16:56`  
Yep

**Ethan** `00:16:57`  
... is that like primarily what this is doing is just measuring the gas composition using, using your mass spec?

**Asaph** `00:17:03`  
Yeah.

**Ethan** `00:17:03`  
Okay.

**Asaph** `00:17:04`  
Yeah. So we're using it either to measure, uh, how a leaf or a portion of a leaf is taking up carbon dioxide and how, uh, you know, light and temperature and things like that are influencing that CO2 uptake. But also with the other optical system, we're also measuring what we call chlorophyll fluorescence. So how much light is being fluoresced off the leaf, and we can use that to infer rates of, uh, photosynthesis and such.

**Ethan** `00:17:30`  
Right.

**Asaph** `00:17:30`  
The other stuff that Kuenzang's doing in the other room is using the same user interface, but to measure, uh, enzyme kinetics. So how an enzyme, you know, is involved in catalyzing a reaction. We're looking at how the, uh, these different enzymes are able to take up carbon dioxide for example.

**Ethan** `00:17:49`  
What, uh, what instruments is she using for that?

**Asaph** `00:17:51`  
Yep. Let's, let's go have a look. So yeah, it's crowded in there. Um, so just be careful of your backpacks. Don't, uh, like swing them or-

**Ethan** `00:18:06`  
Should I set this down over here?

**Asaph** `00:18:08`  
Yeah. You can. However you wanna work, if you want. All right, do you wanna drive just showing what you're doing?

**Kuenzang** `00:18:22`  
Yeah. Um, so I am working with the, the key enzyme called rubisco that takes the CO2 primarily, but it also reacts with oxygen. So these two, um, signals, the blue one is CO2, so carbon dioxide, um, with a mass of forty-four, and the other one is oxygen, so mass thirty-two. So what I do is I, uh, set everything up in the tube right in the back there. So it just seems like little, tiny... Uh, there's just water sitting in there right now. And so I, I put in my enzyme in there, and then I can control the concentration of gas I provide to it. And then when I start the... well, when I initiate the enzyme reaction by adding one of the substrates, um, then I can trace how much of the gas is being pulled out of the system by these enzymes, and that's how we measure, like, the kinetics of the enzyme. Um, yeah, that's pretty much the software that-

**Ethan** `00:19:29`  
You're using a mass spectrometer for that?

**Kuenzang** `00:19:31`  
Mm-hmm. Yes.

**Ethan** `00:19:31`  
Is it the same kind as out there or?

**Kuenzang** `00:19:33`  
Uh, yes, similar.

**Ethan** `00:19:35`  
Well, I mean, like, same interface, uh-

**Kuenzang** `00:19:38`  
Yeah. Mm-hmm.

**Asaph** `00:19:39`  
Yeah. So we basically designed the software so that it can either pull data from this instrument or pull data from that instrument. They, they present the data differently.

**Ethan** `00:19:48`  
Mm-hmm.

**Asaph** `00:19:49`  
And so it's, uh, um, we have to be able to switch between the two, and it just seems easier if we have one system that allows us to switch between, uh, each instrument.

**Ethan** `00:20:02`  
Okay.

**Asaph** `00:20:02`  
And we can... Yeah, we can get into all that.

**Ethan** `00:20:05`  
Yeah. Uh, so you said you have one machine controlling the spec out there.

**Asaph** `00:20:09`  
Yeah.

**Ethan** `00:20:10`  
Is there any Python code controlling it, or is that just through a manual interface?

**Asaph** `00:20:13`  
No, it's all proprietary software, right?

**Ethan** `00:20:16`  
Okay.

**Asaph** `00:20:16`  
So, uh, you can see on that computer over there, that is the, you know, the software that comes-

**Kuenzang** `00:20:21`  
Yeah

**Asaph** `00:20:21`  
... with the equipment. And so we don't wanna mess with that, right? We don't even have... Well, we don't have access to do that, right?

**Ethan** `00:20:27`  
Yeah.

**Asaph** `00:20:27`  
Um, and so but we use that to control the machine, but also, um, and in this case, for this computer, it's actually dumping the data. Um, and so the main difference is, is on this computer, this software here is, like, dumping the data into a file, and then this software is then reading it from that file. So it's kind of going back and forth, uh, going to the file, plotting the data, going to the file, and it's doing that quickly over a long period of time.

**Ethan** `00:20:55`  
Sorry. You said that computer's dumping the data?

**Asaph** `00:20:57`  
Yep, that computer's dumping the data. So basically, we pull it from a file. So there's these small CSV files essentially that this creates, that this then goes and reads. And it's really kind of tricky, and it took a long time to figure this out, is that, like, if this asks for data and there is no data, then the program is crashing all the time. So we figured out a way, or I did-- they figured out, previous students figured out a way to be able to access data, wait for the next file to come before asking for the next bit of data so that the software doesn't crash. The other system over there, the data comes out, um, in, in hexadecimal. Uh, and, and we have to then translate that in real time into binary, and then that gets used for doing the plotting. So there, the data is not, um, necessarily stored in a file. It's streaming continuously, so we have to be able to go to that stream, read it, transform it, and then, you know, manipulate it that way.

**David** `00:21:55`  
Why do you need to translate it to binary?

**Asaph** `00:21:57`  
So basically, you have to, like... So the hexadecimal code is it basically bundles all of the data, and we have to then use, uh, basically translate that to basically separate out all these data streams. So there's, like, four different channels that are buried within those hexadecimal code. And so for us to be able to pull out the relevant data, we have to then convert that hex to, uh, basically decimal data so that we can then use the individual data streams that we're interested in, because a lot of the data is for the instrumentation control and things like that, but it's not relevant for what we're, we're doing. So that's all happening behind the scenes, uh-

**David** `00:22:34`  
That's in their software.

**Asaph** `00:22:35`  
It's all in that software.

**David** `00:22:36`  
Not in your project.

**Asaph** `00:22:37`  
No, it's all in the software.

**Ethan** `00:22:39`  
So you've got four computers in total you're using for this?

**Asaph** `00:22:44`  
What do you... Um-

**Ethan** `00:22:45`  
You got-

**Asaph** `00:22:45`  
Well, yeah. So there's two... Yeah, there's... Each mass spec has its own control computer software, and each mass spec has its own computer that is running the LabVIEW or, yeah, the Lab... uh, sorry, the Python script that is, you know, pulling the data.

**Ethan** `00:23:01`  
Okay.

**Asaph** `00:23:01`  
And it's doing it differently, right? For this machine versus that machine. But you guys shouldn't have to worry about... I mean, I'd like you to know it, right? I think it'd-

**Ethan** `00:23:10`  
Yeah

**Asaph** `00:23:11`  
... be good for you to look through it. But we don't need to change anything in terms of how data's being pulled, data's being manipulated for the most part, except for when Song would like to have some, you know, new things added to these features so that we can more effectively pull data and information that we're interested in. So that would mean we need to do some behind the scenes calculations, um, and also ways of presenting the data on the screen or pulling that data into an Excel file that we can then use later.

**Ethan** `00:23:41`  
All right. And I just wanna make sure we have as much information as possible. Do you know how information is getting out of that computer and into this one?

**Asaph** `00:23:49`  
Well, yeah, they're Ethernet connected.

**Ethan** `00:23:51`  
Okay.

**Asaph** `00:23:51`  
So there's a, uh, there's a, you know, a cable here, the, basically a junction box here. So, um, they are connected that way.

**Ethan** `00:23:59`  
And is that one connected to the junction box out there?

**Asaph** `00:24:01`  
No. No, that one's all different. I can show you how that one's done. So this one basically writes to a folder on this compute-- on that computer there, and then this one here is reading that directory essentially and then pulling the data onto here.

**Ethan** `00:24:15`  
Okay.

**Asaph** `00:24:16`  
So the data is stored on that, uh, computer

**David** `00:24:21`  
So everything's connected over a shared network or just these two computers?

**Asaph** `00:24:24`  
Just these two computers. And they're actually not connected to the... Well, they are connected. This one's connected to the network, that one is not. So it's a landline basically, uh, that's going between here and here, because, um, that one's too old and we can't... Is that one on the... I can't remember. We updated the software-

**Kuenzang** `00:24:41`  
Um-

**Asaph** `00:24:41`  
I can't remember if we're-

**Kuenzang** `00:24:43`  
Yeah, it have... It says it does have internet.

**Asaph** `00:24:46`  
Yeah. So I think it's...'Cause we put- we got the new operating system on there. It used to be like Windows XP or something like that, that was, um... The university didn't support anymore, so we couldn't have it, um, on the internet.

**Ethan** `00:24:58`  
All right. And then where is the mass spec in this room?

**Asaph** `00:25:01`  
Just leaning against-

**Ethan** `00:25:02`  
This?

**Asaph** `00:25:02`  
Yeah.

**Ethan** `00:25:02`  
Okay.

**Asaph** `00:25:03`  
Just don't do that.

**Ethan** `00:25:03`  
Sorry. ([laughs])

**Asaph** `00:25:04`  
Um, yeah, but that's the mass spec right there.

**Ethan** `00:25:05`  
All right. And then how does it connect to that computer?

**Asaph** `00:25:08`  
There's a fiber optic cable back there that, uh, basically runs the data.

**Ethan** `00:25:13`  
Okay. And does this one out there communicate the same way?

**Asaph** `00:25:16`  
Uh, yeah.

**Ethan** `00:25:17`  
Okay.

**David** `00:25:19`  
Whenever you do these calculations, um, is it running on, on each individual computer independently? Or do you have like a server that handles the computations?

**Asaph** `00:25:30`  
No, it happens on this computer. Yeah.

**David** `00:25:32`  
Okay. So is, is there a particular reason you guys are storing everything in files as opposed to maybe something like a database?

**Asaph** `00:25:38`  
Um, well, no, not really. I think for ease. I mean, we don't wanna put it, um, on OneDrive or anything like that'cause we have to... We have a limited storage capacity, and so that would eat that up pretty quickly. Uh, in terms of the database, I mean, we could convert. I mean, you can, um... For example, um, I'll just show you, um... Is there the-

**Ethan** `00:26:10`  
Um-

**Asaph** `00:26:10`  
... snapshot? Okay. Is that this one?

**Kuenzang** `00:26:12`  
Yeah, that one.

**Asaph** `00:26:13`  
Yeah. So this is the, um... This is basically it reading the, the folder over there. And so we run these acquisitions, so each one of these folders would be an experiment and, you know, it creates these massive, uh, sort of lists of files. And so each one of these is a different time interval. If you look at one of these Excel files, basically you can see these are in milliseconds here, and these are the different columns of data that we're pulling. So each time this software, the, the pipeline is, is going to the folder, it's pulling this set of data and then adding it on. So I'm sure there are better ways that we could be storing the data. My concern would be if we manipulate how we store the data, we have to manipulate how we access the data.

**David** `00:27:01`  
Sure.

**Asaph** `00:27:03`  
Yeah. Um, so what about, uh-

**Kuenzang** `00:27:03`  
Yeah, it goes for one second. Every second has that many data points.

**Ethan** `00:27:10`  
Uh, would you mind going back to File Explorer really quick?

**David** `00:27:15`  
Yeah. What's the, uh, the average size of each of these captures or a folder?

**Asaph** `00:27:20`  
So they're, they're relatively small.

**David** `00:27:22`  
Yeah.

**Asaph** `00:27:22`  
Individually, they're relatively small.

**David** `00:27:24`  
Sure.

**Asaph** `00:27:24`  
But if we go back, um, here, um-

**Ethan** `00:27:35`  
Yeah. And I saw some files out there when he was showing us the s- uh, the old captures that were greater than one gigabyte in size.

**David** `00:27:42`  
Oh, really?

**Ethan** `00:27:42`  
So-

**David** `00:27:43`  
Oh, wow.

**Asaph** `00:27:45`  
Uh, none of our files are more... Our data files shouldn't be more than 1 MB.

**Ethan** `00:27:49`  
We can take another look.

**Asaph** `00:27:50`  
Yeah, let's have a look.

**Ethan** `00:27:51`  
Uh, one more thing. Could you click on this PC s- just so I can see, uh, how much storage you guys have access to? That's 500 gigabytes each.

**David** `00:28:03`  
You have access to more storage if you need it. So what happens whenever this computer gets full?

**Asaph** `00:28:07`  
Yeah.

**David** `00:28:07`  
What do you do?

**Asaph** `00:28:08`  
We have to back it up.

**David** `00:28:09`  
You gotta back up the data.

**Asaph** `00:28:10`  
Yeah.

**David** `00:28:10`  
Okay. That's-

**Asaph** `00:28:11`  
We ran into that quite frequently. Well, frequently. Um, but the ma- Yeah, so this is not... This computer is... Is that looking at the... Yeah, that's the, that computer.

**Ethan** `00:28:26`  
Okay. Let me see what other questions I've got here.

**David** `00:28:30`  
So what about, uh, data integrity? I mean, if something goes wrong or the computer crashes and you lose an experiment, how devastating is that?

**Asaph** `00:28:37`  
Um, ([laughs]) that's a good question. It's, it's not ideal, um, of course. One of the nice things, I guess, is that we have data stored in, in multiple locations. So, like, this computer will be running, um, and storing data even if this computer's not on or if something crashes with the pipeline.

**David** `00:28:56`  
Sure.

**Asaph** `00:28:56`  
Right. And we can, like we did before, we can always go back and reload the data'cause it is stored here, so we, um, can rerun and re- you know, redo the analysis. Like, you know, what, uh, Kunzang has here, like she could go back, like this might have been done live, but she could go back tomorrow or the next day and re-plot this data and, and, uh, be able to analyze it again.

**David** `00:29:19`  
Okay. So there's already redundancy in place. It's okay if on this particular machine something bad happens.

**Asaph** `00:29:24`  
Yes.

**David** `00:29:25`  
Okay.

**Asaph** `00:29:25`  
Yeah. And-

**Kuenzang** `00:29:26`  
Yeah. We had issues with that program crashing last semester, I think.

**Asaph** `00:29:30`  
Yeah.

**Kuenzang** `00:29:30`  
They finally... I don't know what they did, but it stopped.

**Asaph** `00:29:33`  
Yeah, there's been all kinds of bugs that we've been working out for the last couple years. Uh, and this is built off of what we had previously used was a, a LabVIEW interface, which is a, another sort of programming language to process the data. We're at the moment, um, doing ourself with that.

**Ethan** `00:29:50`  
Is there ever s- a scenario that you could see, like, you doing as an experiment where you would want to, like, control an instrument based off of the data it's currently reading automatically? Like, I don't know, if this were in a greenhouse, for example-

**Asaph** `00:30:04`  
Yeah

**Ethan** `00:30:05`  
... controlling a water p- pump based on the soil hydration level or something like that?

**Asaph** `00:30:10`  
Um, not in this particular scenario, no.

**Ethan** `00:30:14`  
Okay.

**Asaph** `00:30:14`  
I think, um, maybe when we talk with Diego over there,'cause we'll have two separate-... pieces of, uh, equipment, it may be good to have one controlling the other in terms of when data is collected. So, uh, we could say, for example, if we were on one machine saying, "All right, we're collecting data here," that would prompt the other piece of equipment to take a measurement at that same time so that we would get, um, overlapping data. But at the moment, yeah, we're not using this. I mean, most of what we're doing is, is manual essentially. Like, the manipulation over here is, you know, things that we don't have a computer or a robot yet to do ([laughs]). Like, human robots.

**Ethan** `00:31:01`  
Sure. Yeah. So these two computers, this software in particular, is, uh, is it communicating with one another, or is it just running isolated at each machine?

**Asaph** `00:31:11`  
This one with the other LabVIEW?

**Ethan** `00:31:13`  
Yeah.

**Asaph** `00:31:13`  
Or with the other Python? No, they're totally independent.

**Ethan** `00:31:15`  
Totally independent?

**Asaph** `00:31:17`  
Yeah.

**Ethan** `00:31:17`  
Yeah.

**Asaph** `00:31:17`  
Yeah, they don't-

**Ethan** `00:31:17`  
Is there ever a need for them to communicate or share data?

**Asaph** `00:31:20`  
No. Never.

**Ethan** `00:31:22`  
Okay. And what about, uh, s- security for your data? I mean, does it need to be encrypted at rest, or are there any, like, constraints that you have?

**Asaph** `00:31:31`  
No. I mean, I think if anybody else could interpret it, that'd be super impressed. ([laughs])

**Ethan** `00:31:35`  
([laughs])

**Asaph** `00:31:37`  
We'd wanna hire them. ([laughs])

**Ethan** `00:31:39`  
Yeah.

**Asaph** `00:31:40`  
No, I mean, I, I don't think our data... I mean, I don't know. Do you think your data needs to be...

**Ethan** `00:31:45`  
Yeah.

**Asaph** `00:31:45`  
I mean, I think the biggest thing is, you know, as we showed you those Excel files, I mean, there are a massive number of Excel files. We oftentimes, we have ways of distilling down that data. And again, like Kuenzang's using these bars to only select certain subsets of that data, and then we extract that into a, a much smaller Excel file. So those are data, um, that are near and dear to our hearts because there's been a lot of, um, I'd say manipulation of the data and, and measurements to be able to get that information. Um, but I don't know that we need to worry so much about security.

**Ethan** `00:32:21`  
In terms of, like-

**Asaph** `00:32:22`  
But I don't know. I'm kind of naive when it comes to that kind of stuff.

**Ethan** `00:32:26`  
In terms of, like, viewing the live data-

**Asaph** `00:32:28`  
Yeah

**Ethan** `00:32:29`  
... is sort of what you're hoping for, say, a live average over the course of maybe, I don't know, 10 milliseconds instead of viewing-

**Asaph** `00:32:37`  
Yeah

**Ethan** `00:32:37`  
... individual data points?

**Asaph** `00:32:38`  
Yeah. So right now it is, it is giving us a running average'cause it's too... I mean, the, the frequency of getting it every couple of milliseconds is too much information, and it's too much computational energy as well. And so part of what we've been doing is sort of trying to find the sweet spot of, you know, being able to watch things, uh, happen in real time. Did you... Do you have an acquisition running?

**Kuenzang** `00:33:02`  
No, I just stopped it.

**Asaph** `00:33:03`  
Could you just switch to the control panel and then-

**Kuenzang** `00:33:06`  
Yeah

**Asaph** `00:33:06`  
... just run it?

**Kuenzang** `00:33:06`  
Just run it, yeah. So there's just water in the cuvette right now.

**Asaph** `00:33:12`  
Okay.

**Kuenzang** `00:33:13`  
So it's-

**Asaph** `00:33:13`  
So can I take it out? Or do you wanna take it out and then... Is that okay-

**Kuenzang** `00:33:16`  
Um-

**Asaph** `00:33:16`  
... or are you corroborating?

**Kuenzang** `00:33:18`  
I mean, yeah. I mean, I can... I just wanna-

**Asaph** `00:33:21`  
I just wanna show what happens when we breathe into it.

**Kuenzang** `00:33:23`  
Sure. Go for it. Yeah.

**Asaph** `00:33:25`  
You... Why don't you do it so that I don't freak you?

**Kuenzang** `00:33:28`  
Yeah. ([laughs])

**Ethan** `00:33:28`  
What'd you call that piece of equipment she's about to breathe into?

**Asaph** `00:33:31`  
The cuvette.

**Kuenzang** `00:33:32`  
([inhales])

**Ethan** `00:33:32`  
Like C-U-B-E?

**Asaph** `00:33:34`  
Yeah, C-U-V-E-T-T-E.

**Ethan** `00:33:36`  
Okay.

**Asaph** `00:33:37`  
I didn't put the E on the end. All right.

**Kuenzang** `00:33:49`  
So, yes.

**Asaph** `00:33:49`  
So I'd like one of them to do it just so you get a-

**Kuenzang** `00:33:52`  
Yeah

**Asaph** `00:33:52`  
... a sense of how fast we're... All right. So-

**Kuenzang** `00:33:59`  
So that's just the CO2 it's detecting as I breathe into the cuvette.

**Ethan** `00:34:04`  
What's the, uh, blue line?

**Kuenzang** `00:34:06`  
That's just oxygen. Yeah.

**Ethan** `00:34:09`  
Huh. Do you know the throughput of this data?

**Asaph** `00:34:11`  
What do you want me-

**Ethan** `00:34:12`  
Like how much is going over the wire? Like a kilobyte, a megabyte around what you transmit?

**Asaph** `00:34:17`  
Uh, no, I don't know. So, um, why don't one of you just kind of breathe into, like blow into that chamber right there, and just watch how quickly that, that value changes.

**Ethan** `00:34:31`  
Yeah.

**Asaph** `00:34:31`  
And you don't have to do it hard. ([laughs]) So that's... I mean, as we're breathing, right, we're consuming oxygen, and we're respiring and releasing massive amounts of carbon dioxide. So that's, you know, that's your carbon dioxide signal right there. So it's happening. Things are happening very quickly. And when Kuenzang is doing these measurements, like she's putting in a known amount of carbon dioxide essentially, letting it sit for a little bit, and then initiating with an enzyme, uh, the consumption of that carbon dioxide. And then she's taking measurement points, you know, along different portions of that curve and collecting that data. So that's, um, you know, there's a lot of information here that we're not actually using, right? But we still need to be able to monitor. Like, we need to know when we're at steady state and when we're at a linear rate of consumption, right? So we do a lot of things where we're taking the, the second derivative of this so we can look at the, the rate of change of the consumption, right? Because we wanna know when that rate has basically plateaued. All right. I know you gotta get back to work, so we'll, we'll come out here. Thank you.

**Kuenzang** `00:35:39`  
Uh, yeah. But should I tell them what we want?

**Asaph** `00:35:42`  
Not yet. I think that's too much information here.

**Kuenzang** `00:35:44`  
Okay. ([laughs])

**Ethan** `00:35:44`  
I'm writing everything down, but it's...

**Asaph** `00:35:46`  
Yeah. I mean, I mean, you can talk about it at a later date.

**Kuenzang** `00:35:49`  
Uh, it's just very two small things. Like right now it's running a file, but it would be nice to see what file it is running instead of right now it's just saying it's processing the 3,849 Excel CSV file. I think that's what it's saying. Um, yeah, that-

**Asaph** `00:36:08`  
That's not the acquisition file? The-

**Kuenzang** `00:36:10`  
No. That is not. Yeah. The acquisition is like 5,300-

**Asaph** `00:36:14`  
Got it

**Kuenzang** `00:36:15`  
... files. Yeah.

**Asaph** `00:36:16`  
So-

**Kuenzang** `00:36:16`  
Yeah, it just goes from one, so I think it's telling us that that's the- The other thing is just like, uh, aesthetics. We can get that to be thinner. ([laughs])

**Asaph** `00:36:28`  
Okay.

**Kuenzang** `00:36:28`  
Um, that, uh...'Cause you see like, um, I don't know, the signal here, it's, uh, very, um, like sharp, so we can... Because it has higher resolution.

**Asaph** `00:36:41`  
So we're, we're losing a lot of information-

**Kuenzang** `00:36:43`  
Yeah

**Asaph** `00:36:43`  
... because of the thickness of the lines, right?

**Kuenzang** `00:36:45`  
Yeah.

**Asaph** `00:36:46`  
That would be good.

**Kuenzang** `00:36:46`  
So I don't know if that is possible.

**Asaph** `00:36:47`  
Wasn't the color also we wanted to change to match?

**Kuenzang** `00:36:49`  
Yeah, to match, um,'cause here CO2 is blue and carbon dioxide is green, but there, um, CO2 is blue and oxygen is red, so.

**Asaph** `00:37:04`  
Okay. Got it.

**Kuenzang** `00:37:04`  
Yeah.

**Asaph** `00:37:04`  
You guys should be able to figure that out. ([laughs])

**Ethan** `00:37:06`  
Yeah.

**Kuenzang** `00:37:06`  
So just very simple things, uh-

**Asaph** `00:37:08`  
And that might be a first thing we-

**Kuenzang** `00:37:10`  
That, yeah

**Asaph** `00:37:10`  
... you know, we wanna play around with, but-

**Ethan** `00:37:12`  
Yeah.

**Asaph** `00:37:13`  
Sure.

**David** `00:37:14`  
So I have a question just to be clear on how... Is the data transfer happening from that machine into this one? That one is writing into a file on this machine, and this software is just reading from that file to the other one. Is that what-

**Ethan** `00:37:23`  
Yeah, I've got it, uh, down to just using Windows shared folder.

**David** `00:37:26`  
Just a Windows shared folder.

**Ethan** `00:37:27`  
Or shared drive.

**David** `00:37:27`  
Yeah. Okay. Um, the other question I had is do all of these machines run the same hardware? Do you guys know the specs of these computers?

**Asaph** `00:37:35`  
Uh, no, they don't run the same hardware.

**David** `00:37:38`  
Okay. Is there any way we can get a list of like, uh, the amount of RAM and the processor, things like that?

**Asaph** `00:37:44`  
I think at some point. So I mean, when we're ready and you're ready, I think you can come in and have access to the computers, play around with them. Um, you know, there have been times where we've had students network in so that they can do things from home. Um, but you know, I think let's start slow first-

**David** `00:38:02`  
Sure

**Asaph** `00:38:02`  
... I think, and then let's, um... I think the first thing would be is to get you guys sort of, um, access to this software, right? So you can, um, look to see what's going on in the Python code, talking about with Loic, but you know, maybe trying to implement some of the things that Quanzhong was talking about in terms of-

**Ethan** `00:38:22`  
Yeah

**Asaph** `00:38:22`  
... just starting with line color and line thickness. So let's just see about that. So you have mock data that's also part of the GitHub, uh, folders that you can use to, to run, uh, and test it on your system. Um, and then you can, yeah. We've-- Basically what we've-- what they've set up is they've, uh, I can't remember the right phrase, but basically they've provided us with executables essentially. So we're not actually running Python or anything like that. We just have an executable that we basically are able to double-click on and, and run.

**Ethan** `00:38:53`  
Yeah. What about updates? Like say the old team came in and made some changes to the software, how does the new software get onto the computer?

**Asaph** `00:39:01`  
Yeah. So that is usually them providing us with that executable, and then we, uh, download it and, uh, prepare to run it.

**David** `00:39:09`  
So is there a reason you guys are using Excel files? Is that for your convenience, or is it a decision that might have been made before?

**Asaph** `00:39:16`  
I think whatever company, or the company that was helping us basically dump the data, they just said CSV files, and so that was sort of nice and convenient.

**David** `00:39:26`  
All right.

**Asaph** `00:39:27`  
And so, you know, we're at different stages of our careers and implementation of different software, you know. So some of us are old school and use things like Excel. Um, uh, some of us are more proficient in R. Some of us are more proficient in Python. So, um, we have a lot of people that are at different levels of computation skills. So I think, um, yeah, and this system itself is, you know, 20 years old, right? That software is what it is.

**David** `00:39:57`  
Okay.

**Ethan** `00:39:57`  
Yeah. Sorry, what was your name again?

**Kuenzang** `00:39:59`  
Kuenzang.

**Ethan** `00:40:01`  
Uh, how do, how do I spell that?

**Kuenzang** `00:40:02`  
Um, K-U-E-N-C-A-N-G.

**Ethan** `00:40:06`  
C-Z-A-G?

**Kuenzang** `00:40:09`  
Z-A-N-

**Ethan** `00:40:10`  
Oh, N-G. Okay. And, uh, what, what sort of Python experience do you have?

**Kuenzang** `00:40:16`  
Um, I took one semester of coding class, so I'd say working knowledge. I can Google things. ([laughs]) And, um, yeah.

**Ethan** `00:40:27`  
All right.

**David** `00:40:28`  
So do you guys maintain the software like outside the school year whenever you don't have any students, or, or is it pretty much just if there's a bug in there it's gonna stay in there for a while?

**Asaph** `00:40:35`  
Yeah, if there's a bug in there, I mean, they'll... Yeah.

**Kuenzang** `00:40:38`  
Yeah.

**Asaph** `00:40:38`  
It stays in there. That's why we're ready to do the reboot or something.

**Kuenzang** `00:40:40`  
I mean, the only way we would know is if it crashes on us. ([laughs])

**Asaph** `00:40:43`  
Sure.

**Kuenzang** `00:40:44`  
But, yeah.

**Asaph** `00:40:44`  
But I mean, I think the software is at such a state now where, I mean, I think you and I could go in and change the line color and do some things like that.

**Kuenzang** `00:40:53`  
Yeah, that's true.

**Asaph** `00:40:53`  
But I think, uh, yeah. And we don't... I mean, it's been several years, and it's taken us a while to migrate to this system. And I think, you know, touch wood, we're at a, a spot where I think the, the software is doing everything that, for the most part, that we had been doing previously. Now what we're doing is, you know, some modifications and tweaks. And you know, some of the things you guys are suggesting are maybe things that we wanna try and implement.

**Ethan** `00:41:18`  
Yeah.

**David** `00:41:18`  
Is there ever a need for somebody to like read the data independently outside of the software? Like, like you mentioned that s-some individuals are really good with R, Python, whatever for data analysis. Is there a need for that?

**Asaph** `00:41:27`  
Yeah. So we usually, I mean, Kuenzang and others will pull some of the, the massaged but raw data off and then use R or Excel or Origin or some other software package to do some, some modeling and things like that. And so yeah, this has really given us the primary data, and then we're using, um, you know, other computational tools to basically extract additional information from that.

**Kuenzang** `00:41:53`  
Yeah.

**Asaph** `00:41:54`  
So we could integrate that, but it's-

**Kuenzang** `00:41:55`  
I mean, uh, I think that's what Loic was saying. It would be nice to just have like a computer program go at each curve and then like give you the data-

**Asaph** `00:42:04`  
Yeah

**Kuenzang** `00:42:05`  
... instead of us dragging things around, but I don't know.

**Asaph** `00:42:07`  
I think that's totally feasible, right?

**Ethan** `00:42:09`  
Sorry. Can you say that one more time?

**Kuenzang** `00:42:10`  
Oh, so, uh, I think it's-

**Asaph** `00:42:12`  
Where the-

**Kuenzang** `00:42:13`  
Yeah. So right now, um, the way we get the data is like manual Set this for 30 seconds, and then I will set this as my blank. Um-

**Asaph** `00:42:30`  
I, I have to make it really quick-

**Kuenzang** `00:42:32`  
Yeah, yeah

**Asaph** `00:42:33`  
... because

**Kuenzang** `00:42:33`  
Um, so this is just telling the computer that this is my gas signal when there is no enzyme activity. And then I skip the first 30 seconds because things are being mixed in the cuvette, so I don't think that's my true enzyme activity. And then after that, I would... This is when I would do the extraction, right? So this is my data. So right now what this is telling me is that when my ox- oxygen is 6.4 micromolar, CO2 is 16, the velocity of gas consumption of carbon dioxide is 4.6, and then oxygen is 0.13. This is... Oxygen is lower because this enzyme by nature, um, would prefer to react with carbon dioxide. It just, um, has unfortunate side effect of also reacting with oxygen. So, um, eventually, what we were talking about, uh, with the postdoc and the other grad students is that, you know, not having for us to do this. Wait. Like, um-

**David** `00:43:45`  
This being dragging-

**Kuenzang** `00:43:47`  
Yeah

**David** `00:43:47`  
... that timeline around-

**Kuenzang** `00:43:48`  
Uh-huh

**David** `00:43:48`  
... and then, like extracting-

**Kuenzang** `00:43:49`  
This-

**David** `00:43:49`  
... a section of data?

**Kuenzang** `00:43:50`  
Yeah.

**David** `00:43:50`  
Okay.

**Kuenzang** `00:43:50`  
So right now what I'm doing, this, this was just the run that I did. So what I did was I, like, pulled off all... So every different color here is just my different carbon dioxide injection. So here I can see that as my carbon dioxide increases, my enzyme activity is increased. But this is just, um-

**David** `00:44:11`  
That's something that you plot by hand?

**Kuenzang** `00:44:13`  
Yes.

**David** `00:44:13`  
Okay.

**Kuenzang** `00:44:13`  
So these are just the, those rates that I pull out.

**David** `00:44:19`  
In Word, right?

**Kuenzang** `00:44:20`  
Yeah.

**David** `00:44:20`  
So, like, in, in a perfect world, if you envision, like, your ideal workflow-

**Kuenzang** `00:44:24`  
Yeah. So, like, like I run-

**David** `00:44:25`  
... this looks like-

**Kuenzang** `00:44:25`  
... this thing, and then I get this at the end, you know.

**David** `00:44:28`  
You get exactly that at the end.

**Kuenzang** `00:44:30`  
Yeah. Like, it'd be great if the software is solid. Will know that, like, this is the blank rate. You skip the first 30 seconds, and then collect like a rate after that. Then you clean the cuvette. But I don't know if this is possible because it's like, yeah.

**David** `00:44:46`  
Is that something that you can calculate by hand, or is that something you have to do visually, like based on the graph?

**Kuenzang** `00:44:50`  
Um, well, sort of visually in the sense that I know that when this thing is... When I see this bump, it means that I added my enzyme because the enzyme has some carbon dioxide in it. So that's why I see the bump in the signal. But then this is where the gas is, like, everything is being mixed. And then I, when I know that I see the drawdown, it means my enzyme is working because, um, now the... There's only reason why I'm seeing, uh, the velocity in the system is because the enzyme is pulling it out.

**David** `00:45:26`  
Okay. So, so as soon as you see the drawdown, that's when you know that that's information that you need.

**Kuenzang** `00:45:30`  
Mm-hmm. Yes.

**David** `00:45:31`  
And then how do you know, uh-

**Kuenzang** `00:45:33`  
Um-

**David** `00:45:34`  
... the end of that information?

**Kuenzang** `00:45:35`  
Oh, so we just let it run for about two minutes, but typically we use the first 30 to one minute of information. Um, because the other thing is, like, there can be negative or like a positive feedback inhibition from the product. So from biochemistry point of view, you also don't want to run this reaction for a long time. Actually, in fact, it won't be able to run for a long time. If I let this go on, even though there is still, uh, carbon dioxide left, all the enzyme would have inhibited. So I would see the line, like flat line, um, which means that the enzyme, all the enzymes are completely blocked now, which of you... You can kind of see it here.

**David** `00:46:19`  
Right.

**Kuenzang** `00:46:19`  
You can see that it's all blocked. Yeah.

**David** `00:46:23`  
And then I want to take a note real quick. More technically, what is that, that curve that you were mentioning, that you're like visually seeing?

**Kuenzang** `00:46:28`  
Oh, uh, it's called Michaelis-Menten. So, um, yeah, you can, uh... You probably encountered it in your intro bio or chemistry.

**David** `00:46:45`  
Michaelis-Menten?

**Kuenzang** `00:46:49`  
Yep.

**David** `00:46:51`  
That represents the drawdown. Like the beginning of the drawdown that you care about?

**Kuenzang** `00:46:55`  
Oh, uh, this one? Um, yeah. How would we call this? Enzyme reaction?

**Asaph** `00:47:05`  
Yes.

**David** `00:47:07`  
Yeah.

**Asaph** `00:47:07`  
Enzyme reaction.

**Kuenzang** `00:47:08`  
Yeah. But then the, the modeling we do at the end is called Michaelis-Menten.

**Asaph** `00:47:11`  
Basically, yeah. Basically, we get a curve like that, the rate at different concentrations of gas, the rate of the enzyme for different substrates, and then we use this Michaelis-Menten equation to solve for some of these parameters that we're interested in. So it's basically combining all that data, combining these two equations, and then extracting out.

**Ethan** `00:47:31`  
So do you have like a preferred coding language that you use, say, for data analysis or anything like that?

**Asaph** `00:47:38`  
I think we all do different.

**Kuenzang** `00:47:39`  
Yeah.

**Asaph** `00:47:39`  
Like you use Python, right? I use, uh, Origin, or some people use Excel, some people use R.

**Kuenzang** `00:47:46`  
Yeah. So it's all different.

**Ethan** `00:47:48`  
Right.

**Asaph** `00:47:49`  
Yeah. So the downstream is a little bit sort of user dependent. Do you need to get back to-

**Kuenzang** `00:47:54`  
Yes.

**Ethan** `00:47:54`  
Okay.

**Asaph** `00:47:54`  
All right. Let's go. ([laughs])

**Kuenzang** `00:47:56`  
It was nice to meet you guys.

**Ethan** `00:47:57`  
Yeah. Nice to meet you too.

**Asaph** `00:47:58`  
Thank you.

**Kuenzang** `00:47:58`  
Mm-hmm.

**David** `00:48:01`  
So I've got a, I've got a question. I mean, is there a reason why the software and the UI is written in Python?

**Asaph** `00:48:09`  
No.

**David** `00:48:11`  
Was it just like the easiest thing to do?

**Asaph** `00:48:13`  
Uh, at the time, it seemed like the most, uh, useful one. Like I said, we had used LabVIEW.

**David** `00:48:17`  
Mm-hmm.

**Asaph** `00:48:18`  
Uh, and LabVIEW seemed to be going out of, um, favor with ma- many people. I don't think it's used that much. Except for like instrument control. Have you guys ever used LabVIEW?

**David** `00:48:28`  
No.

**Ethan** `00:48:28`  
Uh, was that what we would use in like our physics labs?

**Asaph** `00:48:30`  
You might have, yeah. Yeah, it's, it's more, uh, like icon. So you're basically linking different icons together, and you can do some manipulation sort of behind the scenes, but it's not like a code-

**Ethan** `00:48:42`  
Yeah

**Asaph** `00:48:42`  
... kind of thing, like icons.

**Ethan** `00:48:44`  
All right.

**Asaph** `00:48:45`  
So yeah, we could use another platform, but I think at this point, we're pretty, um, we're pretty tied in given that we've been doing this for a few years.

**David** `00:48:53`  
Okay. Sure. Um, the other thing with the UI, I mean-

**Asaph** `00:48:58`  
With the what, sorry?

**David** `00:48:59`  
Sorry. Um, I'm trying to think of a way to phrase my question.

**Asaph** `00:49:01`  
Yeah.

**David** `00:49:02`  
Is, is there a need for it to be a piece of software on this computer instead of maybe like a web application that is more configurable or could be deployed anywhere regardless of hardware? Or, or is there, there a hard requirement for it to be an executable?

**Asaph** `00:49:15`  
Uh, no, it doesn't have to be an executable. I mean, I think we were doing that because many people don't have any experience with like loading up Python and running it based on Python.

**David** `00:49:24`  
Yeah.

**Asaph** `00:49:24`  
So if there was a web interface or some other way to deploy it in an easy way, that, that would be-

**David** `00:49:30`  
Is something worth talking about?

**Asaph** `00:49:31`  
Yeah.

**David** `00:49:31`  
Okay.

**Ethan** `00:49:32`  
All right. And do you have anyone in the lab with a lot of Python experience where-- suppose we made it so you guys could write tools, uh... How best to describe this? Say you have a calibration tool. You run it, it auto calibrates the machine for you once you start the run. Um, if we provided a way for them to make their own tools through Python and upload it to the software, like do you have someone who could do that?

**Asaph** `00:49:58`  
Um, yeah, I think there are at different levels, I think for sure. Um, the question is like, do we want to spend the time to do that? Like, you know, like the biology, the biochemistry is really what we're aiming for and after. So I think for most of the postdocs and researchers and students in the lab, like they just want a piece of software that gives them the data, right? And I think the, the more they have to, you know, fiddle and make the machines work, uh, the more that takes them away from doing the things that they are, uh, maybe more interested in.

**Ethan** `00:50:34`  
Mm-hmm.

**Asaph** `00:50:34`  
But I think that that, that might be a nice way for us to have a little more independence sort of moving forward, right? So that, that might be-- maybe we think about, you know-- And let's say, you know, this year we say, "All right, this is the, the ultimate version of this," and yet now what we wanna do is make it more flexible, sort of modular. Like how can we figure out ways to, you know, give people in the lab who don't have as much experience as you guys do, um, make those modifications themselves, right?

**Ethan** `00:51:03`  
Um, do you guys have regular working hours?

**Asaph** `00:51:07`  
No.

**Ethan** `00:51:07`  
Okay.

**Asaph** `00:51:07`  
We have very irregular working hours. But I would say we're, uh, there's somebody in the lab usually nine to five, you know, Monday through Friday. On weekends, probably there are a few people in the lab as well.

**Ethan** `00:51:19`  
All right. And is-

**David** `00:51:20`  
Do you anticipate that in the future something like this would happen again where you have to essentially like onboard a brand new instrument into the software again? Is that something that you see happening for a new experiment or some-- whatever you're doing?

**Asaph** `00:51:30`  
Like if we had to buy a new mass spec instrument?

**Ethan** `00:51:32`  
Or a gas chromatographer.

**Asaph** `00:51:34`  
Yeah. Maybe. Yeah, yeah. I mean, I think that there's many-- I, I would say each, each would have their unique application and would have their own sort of need in terms of data acquisition and manipulation downstream. So I think we would um, you know... For this, I would say it's very specific to-- I mean, it's very specific to use a mass spectrometer and very specific to what we do. There's like maybe one or two other labs in the world that, that kind of do these type of measurements.

**Ethan** `00:52:04`  
Right.

**Asaph** `00:52:05`  
So it's, um, yeah, it's not something that is, that we're gonna make any money on.

**David** `00:52:11`  
Sure.

**Ethan** `00:52:11`  
And if we wanted to stop by and say look at the data software that you have, do we need to email you first? Can we just stop by and say hi and-

**Asaph** `00:52:20`  
Uh, I think as you probably can guess, I mean, sometimes these instruments are-- as a use case comes up, we wouldn't stop to allow you to get in there'cause a lot of what we're doing is sort of, um, time sensitive, right? So I would say probably best to say, hey, can we come in on a Thursday? Or we could set up a time, you know, say every whatever it is, Tuesday at three, you guys can come in and have access. But I think that, um, you know, getting access to Git, um, uh, you will have the same version of this as we do.

**Ethan** `00:52:52`  
Yeah.

**Asaph** `00:52:52`  
Plus you'll have data, um, that will be basically replicating the way your data is delivered. Uh, so I think for the most part, you should have access to that, but I think you're always welcome to set up a time to come down. That'd be great.

**David** `00:53:07`  
Okay.

**Ethan** `00:53:08`  
All right.

**Asaph** `00:53:08`  
Um, and we can meet, you know, at-- for me, it's easier to do this in person, but we can do Zoom without further much difficulty.

**Ethan** `00:53:15`  
Yeah. Uh, in terms of meetings, are you wanting to have regular weekly meetings with us?

**Asaph** `00:53:21`  
I don't know that they need to be weekly. I think it's up to you guys, right? I would say let's see what happens when you get access to the, the GitHub, uh, and the software, try and change the line color and change the line thickness. And I'd love for you to demonstrate that you've done that. Uh, and as you're going through that, um, you know, asking questions, right? Via email or we set up a time and just say, "All right, bring all your questions at once," and we'll-

**Ethan** `00:53:47`  
Yeah

**Asaph** `00:53:47`  
... spend an hour together. Uh, and we can get a room downstairs where, you know, you can project from your laptop, so you can say, "Hey, this is the modifications that we did, or this is the data."

**Ethan** `00:53:59`  
All right.

**David** `00:53:59`  
I have a question about the correctness of the output of the application. How do you know that what you see is what's expected?

**Asaph** `00:54:09`  
Um, well, I think we have historical data that we compare it to. Um, I think we also have, uh, you know, I, I would say there are some, let's say, I would say, uh, ways in which we can determine whether or not the- Those fall within what we would consider reasonable values. Instead of, like sometimes, like when we're bringing into the mass spec, like if it doesn't respond quickly, uh, you know there's something wrong, or if it overshoots, right, or is not as responsive, we can kind of tell if there's an issue. We do calibrations every day, and so if the calibration doesn't, uh, match or is similar to what we've seen previously, um, we can, um, we, we know that there's a, there's an issue there.

**Ethan** `00:54:53`  
All right.

**Asaph** `00:54:53`  
So, uh, a lot of it is just sort of historical knowledge that we're bringing from what we've seen.

**Ethan** `00:55:01`  
So a lot of it's manual. There's no automated way to monitor these things.

**Asaph** `00:55:06`  
Yeah. Yeah, at the moment we haven't quite set that up. I mean, I think it would be interesting to be able to say, "All right, this is X number of standard deviations out of class B," right? And we could say, all right, we could say that automatically right there in the, in the data. But for the most part, it's, it's pretty easy to see, right? I mean, you see those curves, you see how repeatable they are. If something was wrong, we would know it pretty quickly. And one of the things that does happen is sometimes the mass spec goes out of calibration, right? Or there's some contamination that happens. And so instead of seeing that really nice line, right, the data is all over the place, right? It's jumping all over the place. And, you know, you can, you know... The more you zoom in, uh, you can start to see, you know, somewhere, uh, yeah, there is some noise that appears to be getting captured, you know, in the data. We're essentially, you know, by taking the bar, you know, we're, we're, we're running a line through that essentially, right? We're taking the average across that time frame. So it's, it-- at some level, it helps us to be able to sort of minimize that noise. But sometimes there's so much noise, like, I mean, you'll see, you know, spikes in the data that are, you know, as high as some of these calibration points. And we, we know when that happens, or there's just this, you know, periodicity to the data where it's just like, all right, we know that that's an issue, and we know that we need to take care of that.

**Ethan** `00:56:39`  
All right. Uh, is this also a cuvette?

**Asaph** `00:56:42`  
Yep. It's the same thing that Kuenzang was showing you. It's a different type of cuvette. Um, it's for-- So this one, she is doing liquid reactions. Uh, and this one is for a leaf disc. So we can actually place a leaf on top of here and then seal it. Well, you can see it here. Uh, we basically would seal it in there with this system here. And so this is a, um, this is an LED system that allows us to illuminate the leaf, um, through this, uh, fiber optic, or basically this light guide that then illuminates the leaf, drives photosynthesis, and measures the, um, the light quality or the, the-- a, a particular wavelength of light that is coming off the leaf.

**Ethan** `00:57:24`  
Uh, who was the other researcher that you said was working on this?

**Asaph** `00:57:26`  
Diego.

**Ethan** `00:57:27`  
Diego, okay. And do you know his preferred language or if he has Python experience?

**Asaph** `00:57:34`  
Uh, he does, yeah. And so, um, like Kuenzang, I mean, I think he's got a working, uh, you know, understanding of Python. The, the software that he uses to control this is, um, much more, uh, code-based, right? It doesn't have the same user interface as this. And that's what I think we would like to start to integrate into this system.

**Ethan** `00:57:58`  
And did he make this himself, or did you guys buy this?

**Asaph** `00:58:01`  
Uh, in collaboration. We have a group in the Netherlands that we work with. Um, and so they're-- You can look them up if you want. The, the group is called-- Well, it's probably easiest to do JII, is the acronym. Uh, but it's the Jan Ingen-Housz. Let's see if they have it on here. Yeah, this is also a handheld device that you can clip a leaf into and-

**Ethan** `00:58:24`  
It looks like a stapler.

**Asaph** `00:58:26`  
Yeah, it does. But you can get a leaf in there and measure the fluorescence and the, the light energy utilization. So, uh, yeah, we work with this, uh, with this institute quite a bit. And so they're the ones that, um... And they've got their own software team and engineers and whatnot that have, um, designed the Python code that Diego uses to control this, but they did not do this. But they would be, I would say, once we start trying to implement their software into this, they would be really, I think, helpful in sort of, uh, any issues that come up.

**Ethan** `00:59:00`  
Okay. Is there ever a need to control the software or do calculations remotely as you run these experiments or?

**Asaph** `00:59:08`  
No. Not, not so much because, like, we're running the experiments, and we're manipulating the specimens, like, in real time, right? And so that's why it's so important for us to be able to look at this data in real time or near real time because we're watching the system respond and then doing manipulations, um, to the system.

**Ethan** `00:59:27`  
Right. So there's an individual actively here at all times during the collection.

**Asaph** `00:59:32`  
Yeah.

**Ethan** `00:59:33`  
Okay. Can you give us an example of, like, an experiment you would do and the manipulation you would be doing during it?

**Asaph** `00:59:39`  
Yeah. So like Kuenzang was saying, what she would be doing with enzymes is she would put a, um, an extract or purified enzyme into the cuvette, and then she would be giving it different substrates, you know, things that the enzyme reacts to, and to, to watch the rate of that enzyme consumption of the substrates, carbon dioxide or oxygen. So she would be doing that at different oxygen and different carbon dioxide concentrations and different temperatures. So she would, you know, spend all day getting, you know, that curve of the rate of the enzyme in terms of consuming the substrate versus the concentration and doing that, um, periodically. What Diego is doing here is for each one of these is he's putting a, a different leaf into this chamber here And, uh, basically letting the leaf sit in the dark for a little while. And what you're seeing here in the dark is the leaf is respiring, right? Because they're not taking up carbon dioxide, they're releasing carbon dioxide like we were just breathing in. So they're releasing carbon dioxide, and then he flushes the system with a known gas, and basically it becomes steady, right? And then closes the system, so basically removes any gas from going into the chamber. And what this is, is this is the leaf consuming the carbon dioxide that's in the chamber. So basically, it will consume that carbon dioxide until it gets down to this point here. We call this the CO2 compensation point. So at this point, the light is on, but there's not new carbon dioxide coming in except for how much carbon dioxide is being released by respiration. So at this point, the net rate of CO2 uptake, how much CO2 is being consumed by photosynthesis versus what is being released by respiration, is basically the same.

**Ethan** `01:01:30`  
Right.

**Asaph** `01:01:30`  
And so we call that the CO2 compensation point right there. Sorry, I just need to text somebody something about-

**Ethan** `01:01:42`  
You're good

**Asaph** `01:01:42`  
... the next meeting.

**Ethan** `01:01:44`  
Yeah. I w-- I saw that you blocked out an hour for this. Is that about how much time you expected?

**Asaph** `01:01:49`  
Yeah. Yeah, more or less. Yeah. Um...

**Ethan** `01:01:52`  
Yeah. Uh, we can just go discuss amongst ourselves if you have other things you need to go do.

**David** `01:02:01`  
Yeah, I think, I think I've got all my questions answered for now. Um, I'll probably have a lot more as soon as I get my hands on the repo.

**Ethan** `01:02:06`  
Yeah.

**David** `01:02:07`  
But personally, I think I'm good.

**Asaph** `01:02:08`  
Okay. Yeah. So why don't we do this, um, email your TA, I think, about access to GitHub.

**David** `01:02:15`  
Yeah.

**Asaph** `01:02:15`  
Uh, if they don't have access to that anymore, then I can share-- I can clone what I have and share that with you guys.

**David** `01:02:21`  
Yeah. Okay.

**Asaph** `01:02:21`  
Um, and then let me know if you wanna meet next week, if you have had enough time to sort of dig into that software. Um, and you know, I think the three of you kind of working together to kind of understand what the software is doing, how it's doing it, um, and you know, as we were talking about, do some of those basic manipulations.

**Ethan** `01:02:40`  
All right. Cool.

**David** `01:02:41`  
Yeah.

**Ethan** `01:02:42`  
Yeah.

**David** `01:02:42`  
Just one last question.

**Asaph** `01:02:43`  
Yeah.

**David** `01:02:43`  
Uh, this, this instrument that we're onboarding into the software, does there exist any documentation for it or the interface?

**Asaph** `01:02:49`  
No. No, this is all wild west.

**David** `01:02:50`  
So how would we get-

**Asaph** `01:02:52`  
We'll give you access to the, the code.

**David** `01:02:54`  
Okay.

**Ethan** `01:02:54`  
Okay.

**Asaph** `01:02:55`  
Yeah, we'll share that code. But I think first things first, let's figure this out.

**Ethan** `01:02:58`  
Mm-hmm.

**David** `01:02:59`  
Yeah.

**Asaph** `01:02:59`  
And then we'll figure out, like... And then I think what we'll do is we'll spend, uh, an afternoon with Diego. He can show you what that software is doing. You can go through the code, uh, and then we can figure out a way to think about streamlining or integrating into this.

**David** `01:03:13`  
Okay.

**Asaph** `01:03:13`  
And whether or not we want to just get the data in here, or if we wanna use this to control that and get the data. But that's to be determined.

**Ethan** `01:03:21`  
And that's the main goal of-

**Asaph** `01:03:22`  
I think so

**Ethan** `01:03:23`  
... this semester kind of.

**Asaph** `01:03:24`  
Yeah. And any modifications, you know, if you guys-

**Ethan** `01:03:26`  
Yeah

**Asaph** `01:03:26`  
... think of ways in which we might be able to streamline things or do things, you know, differently, we can talk about that.

**Ethan** `01:03:33`  
And then suppose we said, like, "Hey, the system you've got, we could fix it, uh, or we could potentially build you another system that's a lot easier to onboard instruments for, a lot easier for future senior project groups to add stuff for."

**Asaph** `01:03:46`  
Yeah. No, I think so. Yeah.

**Ethan** `01:03:48`  
All right. Cool.

**Asaph** `01:03:48`  
Yeah. All right.

**Ethan** `01:03:48`  
I think that's everything.

**Asaph** `01:03:49`  
All right. Awesome.

**Ethan** `01:03:50`  
It's nice meeting you.

**Asaph** `01:03:51`  
So yeah, I'll wait for you guys to email me, right, about next week if you wanna meet next week.

**David** `01:03:55`  
Yeah.

**Asaph** `01:03:55`  
And otherwise, we'll maybe in two weeks. Is that...?

**David** `01:03:58`  
Yeah. Sounds good.

**Ethan** `01:03:59`  
Yeah. Let me just write that down.

**Asaph** `01:04:09`  
And whether or not, uh, we can pick a time that's better for everybody.

**Ethan** `01:04:26`  
Cool. Thank you.

**Asaph** `01:04:27`  
Yeah. Thank you guys. Appreciate you guys.

**David** `01:04:30`  
Thanks for taking the time to do this.

**Asaph** `01:04:31`  
Yeah. Hope that was nice. Have a good weekend.

**Ethan** `01:04:33`  
You too. ([door opening])
