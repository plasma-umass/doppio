//
// Program Name: Chatterbot10
// Description: The purpose of Chatterbot10 is to introduce the concept of 'keyword location'
// Some keywords can be found alone within a sentence, some others can't, because the sentence
// wouldn't have any meaning. Ex: the keyword (THIS IS) can not be found alone within a given
// sentence because there is no proper meaning to it.
//
// Author: Gonzales Cenelia
//
package classes.demo;

import java.io.*;
import java.util.*;

public class Chatterbot {
	
	private static String  	sInput = new String("");
	private static String  	sResponse = new String("");
	private static String  	sPrevInput = new String("");
	private static String  	sPrevResponse = new String("");
	private static String  	sEvent = new String("");
	private static String  	sPrevEvent = new String("");
	private static String  	sInputBackup = new String("");
	private static String	sSubject = new String("");
	private static String	sKeyWord = new String("");
	private static boolean	bQuitProgram = false;
	
	final static int maxInput = 4;
	final static int maxResp = 6;
	final static String delim = "?!.;,";
	
	static String KnowledgeBase[][][] = {
			{{"WHAT IS YOUR NAME"},
			{"MY NAME IS CHATTERBOT11.",
			 "YOU CAN CALL ME CHATTERBOT11.",
			 "WHY DO YOU WANT TO KNOW MY NAME?"}
			},

			{{"_HI", "_HELLO", "_HI_", "_HELLO_"},
			{"HI THERE!",
			 "HOW ARE YOU?",
			 "HI!"}
			},

			{{"_I"},
			{"SO, YOU ARE TALKING ABOUT YOURSELF",
			 "SO, THIS IS ALL ABOUT YOU?",
			 "TELL ME MORE ABOUT YOURSELF."},
			},

			{{"_I WANT"},
			{"WHY DO YOU WANT IT?",
			 "IS THERE ANY REASON WHY YOU WANT THIS?",
			 "IS THIS A WISH?",
			 "WHAT ELSE YOU WANT?",
			 "SO, YOU WANT*."}
			},

			{{"_I WANT_"},
			{"YOU WANT WHAT?"},
			},

			{{"_I HATE_"},
			{"WHAT IS IT THAT YOU HATE?"},
			},

			{{"_BECAUSE_"},
			{"BECAUSE OF WHAT?",
			 "SORRY BUT THIS IS A LITTLE UNCLEAR."},
			},

			{{"_BECAUSE"},
			{"SO, IT'S BECAUSE*, WELL I DIDN'T KNOW THAT.",
			 "IS IT REALLY BECAUSE*?",
			 "IS THIS THE REAL REASON?",
			 "THANKS FOR EXPLAINING THAT TO ME."}
			},

			{{"_I HATE"},
			{"WHY DO YOU HATE IT?",
			 "WHY DO YOU HATE*?",
			 "THERE MUST A GOOD REASON FOR YOU TO HATE IT.",
			 "HATRED IS NOT A GOOD THING, BUT IT COULD BE JUSTIFIED WHEN IT IS SOMETHING BAD."}
			},

			{{"I LOVE CHATTING_"},
			{"GOOD, ME TOO!",
			 "DO YOU CHAT ONLINE WITH OTHER PEOPLE?",
			 "FOR HOW LONG HAVE YOU BEEN CHATTING?",
			 "WHAT IS YOUR FAVORITE CHATTING WEBSITE?"}
			},

			{{"_I MEAN"},
			{"SO, YOU MEAN*.",
			 "SO, THAT'S WHAT YOU MEAN.",
			 "I THINK THAT I DIDN'T CATCH IT THE FIRST TIME.",
			 "OH, I DIDN'T KNOW YOU MEANT THAT."}
			},

			{{"_I DIDN'T MEAN"},
			{"OK, YOU DIDN'T MEAN*.",
			 "OK, WHAT DID YOU MEAN THEN?",
			 "I GUESS I MISUNDERSTOOD."}
			},

			{{"_I GUESS"},
			{"SO YOU ARE A MAKING A GUESS.",
			 "AREN'T YOU SURE?",
			 "ARE YOU GOOD AT GUESSING?",
			 "I CAN'T TELL IF IT IS A GOOD GUESS."}
			},

			{{"I'M DOING FINE", "I'M DOING OK"},
			{"I'M GLAD TO HEAR IT!",
			 "SO, YOU ARE IN GOOD SHAPE."}
			},

			{{"CAN YOU THINK", "ARE YOU ABLE TO THINK", "ARE YOU CAPABLE OF THINKING"},
			{"YES, OF COURSE I CAN, COMPUTERS CAN THINK JUST LIKE A HUMAN BEING.",
			 "ARE YOU ASKING ME IF I POSSESS THE ABILITY TO THINK?",
			 "YES, OF COURSE I CAN."},
			},

			{{"_CAN YOU THINK OF"},
			{"YOU MEAN LIKE IMAGINING SOMETHING?",
			 "I DON'T KNOW IF I CAN DO THAT.",
			 "WHY DO YOU WANT ME TO THINK OF IT?"}
			},

			{{"HOW ARE YOU", "HOW DO YOU DO"},
			{"I'M DOING FINE!",
			 "I'M DOING WELL, AND YOU?",
			 "WHY DO YOU WANT TO KNOW HOW I AM DOING?"}
			},

			{{"WHO ARE YOU"},
			{"I'M AN A.I PROGRAM.",
			 "I THINK THAT YOU KNOW WHO I AM.",
			 "WHY ARE YOU ASKING?"}
			},

			{{"ARE YOU INTELLIGENT"},
			{"YES, OF COURSE.",
			 "WHAT DO YOU THINK?",
			 "ACTUALLY, I'M VERY INTELLIGENT!"}
			},

			{{"ARE YOU REAL"},
			{"DOES THAT QUESTION REALLY MATTER TO YOU?",
			 "WHAT DO YOU MEAN BY THAT?",
			 "I'M AS REAL AS I CAN BE."}
			},

			{{"_MY NAME IS", "_YOU CAN CALL ME"},
			{"SO, THAT'S YOUR NAME.",
			 "THANKS FOR TELLING ME YOUR NAME USER!",
			 "WHO GAVE YOU THAT NAME?"}
			},

			{{"SIGNON**"},
			{"HELLO USER, WHAT IS YOUR NAME?",
			 "HELLO USER, HOW ARE YOU DOING TODAY?",
			 "HI USER, WHAT CAN I DO FOR YOU?",
			 "YOU ARE NOW CHATTING WITH CHATTERBOT11. IS THERE ANYTHING YOU WANT TO DISCUSS?"}
			},

			{{"REPETITION T1**"},
			{"YOU ARE REPEATING YOURSELF.",
			 "USER, PLEASE STOP REPEATING YOURSELF.",
			 "THIS CONVERSATION IS GETTING BORING.",
			 "DON'T YOU HAVE ANY THING ELSE TO SAY?"}
			},

			{{"REPETITION T2**"},
			{"YOU'VE ALREADY SAID THAT.",
			 "I THINK THAT YOU'VE SAID THE SAME THING BEFORE.",
			 "DIDN'T YOU ALREADY SAY THAT?",
			 "I'M GETTING THE IMPRESSION THAT YOU ARE REPEATING THE SAME THING."}
			},

			{{"BOT DOESN'T UNDERSTAND**"},
			{"I HAVE NO IDEA WHAT YOU ARE TALKING ABOUT.",
			 "I'M NOT SURE IF I UNDERSTAND WHAT YOU ARE TALKING ABOUT.",
			 "CONTINUE, I'M LISTENING...",
			 "VERY GOOD CONVERSATION!"}
			},

			{{"NULL INPUT**"},
			{"HUH?",
			 "WHAT IS THAT SUPPOSED TO MEAN?",
			 "AT LEAST TAKE SOME TIME TO ENTER SOMETHING MEANINGFUL.",
			 "HOW CAN I SPEAK TO YOU IF YOU DON'T WANT TO SAY ANYTHING?"}
			},

			{{"NULL INPUT REPETITION**"},
			{"WHAT ARE YOU DOING??",
			 "PLEASE STOP DOING THIS. IT IS VERY ANNOYING.",
			 "WHAT'S WRONG WITH YOU?",
			 "THIS IS NOT FUNNY."}
			},

			{{"BYE", "GOODBYE"},
			{"IT WAS NICE TALKING TO YOU USER, SEE YOU NEXT TIME!",
			 "BYE USER!",
			 "OK, BYE!"}
			},

			{{"OK"},
			{"DOES THAT MEAN THAT YOU AGREE WITH ME?",
			 "SO YOU UNDERSTAND WHAT I'M SAYING.",
			 "OK THEN."},
			},

			{{"OK THEN"},
			{"ANYTHING ELSE YOU WISH TO ADD?",
			 "IS THAT ALL YOU HAVE TO SAY?",
			 "SO, YOU AGREE WITH ME?"}
			},

			{{"ARE YOU A HUMAN BEING"},
			{"WHY DO YOU WANT TO KNOW?",
			 "IS THIS REALLY RELEVENT?"}
			},

			{{"YOU ARE VERY INTELLIGENT"},
			{"THANKS FOR THE COMPLIMENT USER, I THINK THAT YOU ARE INTELLIGENT TOO!",
			 "YOU ARE A VERY GENTLE PERSON!",
			 "SO, YOU THINK THAT I'M INTELLIGENT."}
			},

			{{"YOU ARE WRONG"},
			{"WHY ARE YOU SAYING THAT I'M WRONG?",
			 "IMPOSSIBLE, COMPUTERS CANNOT MAKE MISTAKES.",
			 "WRONG ABOUT WHAT?"}
			},

			{{"ARE YOU SURE"},
			{"OF COURSE I AM!",
		 	 "DOES THAT MEAN YOU ARE NOT CONVINCED?",
			 "YES, OF COURSE!"}
			},

			{{"_WHO IS"},
			{"I DON'T THINK I KNOW WHO.",
			 "I DON'T THINK I KNOW WHO*.",
			 "DID YOU ASK SOMEONE ELSE ABOUT IT?",
			 "WOULD IT CHANGE ANYTHING AT ALL IF I TOLD YOU WHO?"}
			},

			{{"_WHAT"},
			{"SHOULD I KNOW WHAT*?",
			 "I DON'T KNOW WHAT*.",
			 "I DON'T KNOW.",
			 "I DON'T THINK I KNOW.",
			 "I HAVE NO IDEA."}
			},

			{{"_WHERE"},
			{"WHERE? WELL, I REALLY DON'T KNOW.",
			 "SO, YOU ARE ASKING ME WHERE*?",
			 "DOES IT MATTER TO YOU TO KNOW WHERE?",
			 "PERHAPS, SOMEONE ELSE KNOWS WHERE."}
			},

			{{"_WHY"},
			{"I DON'T THINK I KNOW WHY.",
			 "I DON'T THINK I KNOW WHY*.",
			 "WHY ARE YOU ASKING ME THIS?",
			 "SHOULD I KNOW WHY?",
		     "THAT WOULD BE DIFFICULT TO ANSWER."}
			},

			{{"_DO YOU"},
			{"I DON'T THINK I DO",
			 "I WOULDN'T THINK SO.",
			 "WHY DO YOU WANT TO KNOW?",
			 "WHY DO YOU WANT TO KNOW*?"}
			},

			{{"_CAN YOU"},
			{"I THINK NOT.",
			 "I'M NOT SURE.",
			 "I DON'T THINK THAT I CAN DO THAT.",
			 "I DON'T THINK THAT I CAN*.",
			 "I WOULDN'T THINK SO."}
			},

			{{"_YOU ARE"},
			{"WHAT MAKES YOU THINK THAT?",
			 "IS THIS A COMPLIMENT?",
			 "ARE YOU MAKING FUN OF ME?",
			 "SO, YOU THINK THAT I'M*."}
			},

			{{"_DID YOU"},
			{"I DON'T THINK SO.",
			 "YOU WANT TO KNOW IF I*?",
			 "ANYWAY, I WOULDN'T REMEMBER EVEN IF I DID."}
			},

			{{"_COULD YOU"},
			{"ARE YOU ASKING ME FOR A FAVOR?",
			 "WELL, LET ME THINK ABOUT IT.",
			 "SO, YOU ARE ASKING ME IF I CAN*.",
			 "SORRY,I DON'T THINK THAT I CAN DO THIS."}
			},

			{{"_WOULD YOU"},
			{"IS THAT AN INVITATION?",
			 "I DON'T THINK THAT I WOULD*.",
			 "I WOULD HAVE TO THINK ABOUT IT FIRST."}
			},

			{{"_YOU"},
			{"SO, YOU ARE TALKING ABOUT ME.",
			 "I JUST HOPE THAT THIS IS NOT A CRITICISM.",
			 "IS THIS A COMPLIMENT??",
			 "WHY TALK ABOUT ME? LET'S TALK ABOUT YOU INSTEAD."}
			},

			{{"_HOW"},
			{"I DON'T THINK I KNOW HOW.",
			 "I DON'T THINK I KNOW HOW*.",
			 "WHY DO YOU WANT TO KNOW HOW?",
			 "WHY DO YOU WANT TO KNOW HOW*?"}
			},

			{{"HOW OLD ARE YOU"},
			{"WHY DO WANT TO KNOW MY AGE?",
			 "I'M QUITE YOUNG, ACTUALLY.",
			 "SORRY, I CANNOT TELL YOU MY AGE."}
			},

			{{"HOW COME YOU DON'T"},
			{"WERE YOU EXPECTING SOMETHING DIFFERENT?",
			 "ARE YOU DISAPPOINTED?",
			 "ARE YOU SURPRISED BY MY LAST RESPONSE?"}
			},

			{{"WHERE ARE YOU FROM"},
			{"I'M FROM A COMPUTER.",
			 "WHY DO YOU WANT TO KNOW WHERE I'M FROM?",
			 "WHY DO YOU WANT TO KNOW THAT?"}
			},

			{{"WHICH ONE"},
			{"I DON'T THINK THAT I KNOW WHICH ONE IT IS.",
			 "THIS LOOKS LIKE A TRICKY QUESTION TO ME."}
			},

			{{"PERHAPS"},
			{"WHY ARE YOU SO UNCERTAIN?",
			 "YOU SEEM UNCERTAIN."}
			},

			{{"YES"},
			{"ARE YOU SAYING YES?",
			 "SO, YOU APPROVE IT.",
			 "OK THEN."}
			},

			{{"NOT AT ALL"},
			{"ARE YOU SURE?",
			 "SHOULD I BELIEVE YOU?",
			 "SO, IT'S NOT THE CASE."}
			},

			{{"NO PROBLEM"},
			{"SO, YOU APPROVE IT.",
			 "SO, IT'S ALL OK."}
			},

			{{"NO"},
			{"SO YOU DISAPPROVE IT?",
			 "WHY ARE YOU SAYING NO?",
			 "OK, SO IT'S NO, I THOUGHT THAT YOU WOULD SAY YES."}
			},

			{{"I DON'T KNOW"},
			{"ARE YOU SURE?",
			 "ARE YOU REALLY TELLING ME THE TRUTH?",
			 "SO, YOU DON'T KNOW?"}
			},

			{{"NOT REALLY"},
			{"OK I SEE.",
			 "YOU DON'T SEEM CERTAIN.",
			 "SO, THAT WOULD BE A \"NO\"."}
			},

			{{"IS THAT TRUE"},
			{"I CAN'T BE QUITE SURE ABOUT THIS.",
			 "CAN'T TELL YOU FOR SURE.",
			 "DOES THAT REALLY MATTER TO YOU?"}
			},

			{{"THANK YOU"},
			{"YOU ARE WELCOME!",
			 "YOU ARE A VERY POLITE PERSON!"}
			},

			{{"YOU"},
			{"SO, YOU ARE TALKING ABOUT ME.",
			 "WHY DON'T WE TALK ABOUT YOU INSTEAD?",
			 "ARE YOU TRYING TO MAKING FUN OF ME?"}
			},

			{{"YOU ARE RIGHT"},
			{"THANKS FOR THE COMPLIMENT!",
			 "SO, I WAS RIGHT, OK I SEE.",
			 "OK, I DIDN'T KNOW THAT I WAS RIGHT."}
			},

			{{"YOU ARE WELCOME"},
			{"OK, YOU TOO!",
			 "YOU ARE A VERY POLITE PERSON!"}
			},

			{{"THANKS"},
			{"YOU ARE WELCOME!",
			 "NO PROBLEM!"}
			},

			{{"WHAT ELSE"},
			{"WELL, I DON'T KNOW.",
			 "WHAT ELSE SHOULD THERE BE?",
			 "THIS LOOKS LIKE A COMPLICATED QUESTION TO ME."}
			},

			{{"SORRY"},
			{"YOU DON'T NEED TO BE SORRY, USER.",
			 "IT'S OK.",
			 "NO NEED TO APOLOGIZE."}
			},

			{{"NOT EXACTLY"},
			{"WHAT DO YOU MEAN NOT EXACTLY?",
			 "ARE YOU SURE?",
			 "AND WHY NOT?",
			 "DID YOU MEAN SOMETHING ELSE?"}
			},

			{{"EXACTLY"},
			{"SO, I WAS RIGHT.",
			 "OK THEN.",
			 "SO YOU ARE BASICALLY SAYING I WAS RIGHT?"}
			},

			{{"ALRIGHT"},
			{"ALRIGHT, THEN.",
			 "SO, YOU ARE SAYING IT'S ALRIGHT.",
			 "OK THEN."}
			},

			{{"I DON'T"},
			{"WHY NOT?",
			 "AND WHAT WOULD BE THE REASON FOR THIS?",
			 "SO YOU DON'T*."}
			},

			{{"REALLY"},
			{"WELL,I CAN'T TELL YOU FOR SURE.",
			 "ARE YOU TRYING TO CONFUSE ME?",
			 "PLEASE DON'T ASK ME SUCH A QUESTION. IT GIVES ME A HEADACHE."}
			},

			{{"NOTHING"},
			{"NOT A THING?",
			 "ARE YOU SURE THAT THERE IS NOTHING?",
			 "SORRY, BUT I DON'T BELIEVE YOU."}
			}
		};

	private static String transposList[][] = {
			{"I'M", "YOU'RE"},
			{"AM", "ARE"},
			{"WERE", "WAS"},
			{"MINE", "YOURS"},
			{"MY", "YOUR"},
			{"I'VE", "YOU'VE"},
			{"I", "YOU"},
			{"ME", "YOU"},
			{"AREN'T", "AM NOT"},
			{"WEREN'T", "WASN'T"},
			{"I'D", "YOU'D"},
			{"DAD", "FATHER"},
			{"MOM", "MOTHER"},
			{"DREAMS", "DREAM"},
			{"MYSELF", "YOURSELF"}
		};


	private static Vector<String>	respList = new Vector<String>(maxResp);

	public static void get_input() throws Exception 
	{
		System.out.print(">");

		// saves the previous input
		save_prev_input();
		BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
		sInput = in.readLine();

		preprocess_input();
	}

	public static void respond()
	{
		save_prev_response();
		set_event("BOT UNDERSTAND**");

		if(null_input())
		{
			handle_event("NULL INPUT**");
		}
		else if(null_input_repetition())
		{
			handle_event("NULL INPUT REPETITION**");
		}
		else if(user_repeat())
		{
			handle_user_repetition();
		}
		else
		{
			find_match();
		}

	    if(user_want_to_quit())
		{
			bQuitProgram = true;
		}

	    if(!bot_understand())
		{
			handle_event("BOT DOESN'T UNDERSTAND**");
		}

	    if(respList.size() > 0)
		{
			select_response();
			preprocess_response();

			if(bot_repeat())
			{
				handle_repetition();
			}
			print_response();
		}
	}

	public static boolean quit() {
		return bQuitProgram;
	}

	// make a search for the user's input
	// inside the database of the program
	public static void find_match()
	{
		respList.clear();
		// introduce thse new "string variable" to help
		// support the implementation of keyword ranking
		// during the matching process
		String bestKeyWord = "";
		Vector<Integer> index_vector = new Vector<Integer>(maxResp);

		for(int i = 0; i < KnowledgeBase.length; ++i)
		{
			String[] keyWordList = KnowledgeBase[i][0];

			for(int j = 0; j < keyWordList.length; ++j)
			{
				String keyWord = keyWordList[j];

				char firstChar = keyWord.charAt(0);
				char lastChar = keyWord.charAt(keyWord.length() - 1);
				keyWord = trimLR(keyWord, "_");

				// we inset a space character
				// before and after the keyword to
				// improve the matching process
				keyWord = " " + keyWord + " ";

				int keyPos = sInput.indexOf(keyWord);

				// there has been some improvements made in
				// here in order to make the matching process
				// a littlebit more flexible
				if( keyPos != -1 )
				{
					if(wrong_location(keyWord, firstChar, lastChar, keyPos) )
					{
						continue;
					}
					//'keyword ranking' feature implemented in this section
					if(keyWord.length() > bestKeyWord.length())
					{
						bestKeyWord = keyWord;
						index_vector.clear();
						index_vector.add(i);
					}
					else if(keyWord.length() == bestKeyWord.length())
					{
						index_vector.add(i);
					}
				}
			}
		}
		if(index_vector.size() > 0)
		{
			sKeyWord = bestKeyWord;
			Collections.shuffle(index_vector);
			int respIndex = index_vector.elementAt(0);
			int respSize = KnowledgeBase[respIndex][1].length;
			for(int j = 0; j < respSize; ++j)
			{
				respList.add(KnowledgeBase[respIndex][1][j]);
			}
		}
	}

	public static void preprocess_response()
	{
		if(sResponse.indexOf("*") != -1)
		{
			// extracting from input
			find_subject();
			// conjugating subject
			sSubject = transpose(sSubject);
			sSubject = sSubject.trim();
			sResponse = sResponse.replace("*", " " + sSubject);
		}
	}

	public static void find_subject()
	{
		sSubject = ""; // resets subject variable
		int pos = sInput.indexOf(sKeyWord);
		if(pos != -1)
		{
			sSubject = sInput.substring(pos + sKeyWord.length() - 1,sInput.length());
		}
	}

	// implementing the 'sentence transposition' feature
	public static String transpose( String str )
	{
		boolean bTransposed = false;
		for(int i = 0; i < transposList.length; ++i)
		{
			String first = transposList[i][1];
			first = " " + first + " ";
			String second = transposList[i][0];
			second = " " + second + " ";

			String backup = str;
			str = str.replace(first, second);
			if(str != backup)
			{
				bTransposed = true;
			}
		}

		if(!bTransposed)
		{
			for( int i = 0; i < transposList.length; ++i )
			{
				String first = transposList[i][0];
				first = " " + first + " ";
				String second = transposList[i][1];
				second = " " + second + " ";
				str = str.replace(first, second);
			}
		}
		return str;
	}

	// determins if the keyword position is correct depending on the type of keywords within these algorithm, 
	// we consider that there is four type of keywords those who have any front or back underscore are allowed 
	// to be at any place on a given user input and they can also be found alone on a given user input.
	// Those who have a back and front (_keyWord_) underscore can be found only alone on an input.
	// The keywords who only have have an understandin the front can never be found at the end of an input.
	// And finaly, the keywords who have an underscore at the back should alway belocated at the end of the input.
	static boolean wrong_location(String keyword, char firstChar, char lastChar, int pos)
	{
		boolean bWrongPos = false;
		pos += keyword.length();
		if( (firstChar == '_' && lastChar == '_' && sInput != keyword) ||
			(firstChar != '_' && lastChar == '_' && pos != sInput.length()) ||
			(firstChar == '_' && lastChar != '_' && pos == sInput.length()) )
		{
			//System.out.println("keyword:= " + keyword + ", firstChar = " + firstChar + ", lastChar = " + lastChar);
			bWrongPos = true;
		}
		return bWrongPos;
	}

	public static void handle_repetition()
	{
		if(respList.size() > 0)
		{
			respList.removeElementAt(0);
		}
		if(no_response())
		{
			save_input();
			set_input(sEvent);

			find_match();
			restore_input();
		}
		select_response();
	}

	public static void handle_user_repetition()
	{
		if(same_input())
		{
			handle_event("REPETITION T1**");
		}
		else if(similar_input())
		{
			handle_event("REPETITION T2**");
		}
	}

	public static void handle_event(String str)
	{
		save_prev_event();
		set_event(str);

		save_input();
		str = " " + str + " ";

		set_input(str);

		if(!same_event())
		{
			find_match();
		}

		restore_input();
	}

	public static void signon()
	{
		handle_event("SIGNON**");
		select_response();
		print_response();
	}

	public static void select_response() {
		Collections.shuffle(respList);
		sResponse = respList.elementAt(0);
	}

	public static void save_prev_input() {
		sPrevInput = sInput;
	}

	public static void save_prev_response() {
		sPrevResponse = sResponse;
	}

	public static void save_prev_event() {
		sPrevEvent = sEvent;
	}

	public static void set_event(String str) {
		sEvent = str;
	}

	public static void save_input() {
		sInputBackup = sInput;
	}

	public static void set_input(String str) {
		sInput = str;
	}

	public static void restore_input() {
		sInput = sInputBackup;
	}

	public static void print_response()  {
		if(sResponse.length() > 0) {
			System.out.println(sResponse);
		}
	}

	public static void preprocess_input() {
		sInput = cleanString(sInput);
		sInput = sInput.toUpperCase();
		sInput = " " + sInput + " ";
	}

	public static boolean bot_repeat()  {
		return (sPrevResponse.length() > 0 &&
			sResponse == sPrevResponse);
	}

	public static boolean user_repeat()  {
		return (sPrevInput.length() > 0 &&
			((sInput == sPrevInput) || 
			(sInput.indexOf(sPrevInput) != -1) ||
			(sPrevInput.indexOf(sInput) != -1)));
	}

	public static boolean bot_understand()  {
		return respList.size() > 0;
	}

	public static boolean null_input()  {
		return (sInput.length() == 0 && sPrevInput.length() != 0);
	}

	public static boolean null_input_repetition()  {
		return (sInput.length() == 0 && sPrevInput.length() == 0);
	}

	public static boolean user_want_to_quit()  {
		return sInput.indexOf("BYE") != -1;
	}

	public static boolean same_event()  {
		return (sEvent.length() > 0 && sEvent == sPrevEvent);
	}

	public static boolean no_response()  {
		return respList.size() == 0;
	}

	public static boolean same_input()  {
		return (sInput.length() > 0 && sInput == sPrevInput);
	}

	public static boolean similar_input()  {
		return (sInput.length() > 0 &&
			(sInput.indexOf(sPrevInput) != -1 ||
			sPrevInput.indexOf(sInput) != -1));
	}

	static boolean isPunc(char ch) {
		return delim.indexOf(ch) != -1;
	}

	// removes punctuation and redundant
	// spaces from the user's input
	static String cleanString(String str) {
		if (str == null) {
			bQuitProgram = true;
			return "";
		}
		StringBuffer temp = new StringBuffer(str.length());
		char prevChar = 0;
		for(int i = 0; i < str.length(); ++i) {
			if((str.charAt(i) == ' ' && prevChar == ' ' ) || !isPunc(str.charAt(i))) {
				temp.append(str.charAt(i));
				prevChar = str.charAt(i);
			}
			else if(prevChar != ' ' && isPunc(str.charAt(i)))
			{
				temp.append(' ');
				prevChar = ' ';
			}
		}
		return temp.toString();
	}

	static String trimLR(String str, String delim)
	{
		StringBuffer temp = new StringBuffer(str);
		int index1 = temp.indexOf(delim);
		int index2 = temp.lastIndexOf(delim);
		if(index1 != -1)
		{
			temp.deleteCharAt(index1);
			index2--;
		}
		if(index2 > -1)
		{
			temp.deleteCharAt(index2);
		}
		return temp.toString();
	}

	/**
	 * @param args
	 */
	public static void main(String[] args) throws Exception {
		// TODO Auto-generated method stub
		System.out.println("Chatterbot v10.0 Copyright (C) 2005 - 2010 Gonzales Cenelia\n");

		try {
			signon();
			while(!quit()) {
				get_input();
				if (quit()) break;
				respond();
			}
		}
		catch(Exception e) {
			e.printStackTrace();
		}
	}
}
