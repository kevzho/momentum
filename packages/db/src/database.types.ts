export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          description: string;
          id: string;
          key: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          description: string;
          id?: string;
          key: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          description?: string;
          id?: string;
          key?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      calendar_blocks: {
        Row: {
          all_day: boolean;
          cancelled: boolean;
          color: Database["public"]["Enums"]["project_color"] | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          end_at: string;
          habit_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date: string | null;
          recurrence: Json | null;
          recurrence_until: string | null;
          series_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          all_day?: boolean;
          cancelled?: boolean;
          color?: Database["public"]["Enums"]["project_color"] | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          end_at: string;
          habit_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date?: string | null;
          recurrence?: Json | null;
          recurrence_until?: string | null;
          series_id?: string | null;
          start_at: string;
          task_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          all_day?: boolean;
          cancelled?: boolean;
          color?: Database["public"]["Enums"]["project_color"] | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          end_at?: string;
          habit_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["block_kind"];
          occurrence_date?: string | null;
          recurrence?: Json | null;
          recurrence_until?: string | null;
          series_id?: string | null;
          start_at?: string;
          task_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_blocks_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_blocks_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "calendar_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_blocks_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_blocks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cosmetic_definitions: {
        Row: {
          available: boolean;
          description: string;
          id: string;
          key: string;
          kind: Database["public"]["Enums"]["cosmetic_kind"];
          name: string;
          price: number;
          sort_order: number;
        };
        Insert: {
          available?: boolean;
          description: string;
          id?: string;
          key: string;
          kind: Database["public"]["Enums"]["cosmetic_kind"];
          name: string;
          price: number;
          sort_order?: number;
        };
        Update: {
          available?: boolean;
          description?: string;
          id?: string;
          key?: string;
          kind?: Database["public"]["Enums"]["cosmetic_kind"];
          name?: string;
          price?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      course_weeks: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          materials: string | null;
          topic: string | null;
          updated_at: string;
          user_id: string;
          week_number: number;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          materials?: string | null;
          topic?: string | null;
          updated_at?: string;
          user_id: string;
          week_number: number;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          materials?: string | null;
          topic?: string | null;
          updated_at?: string;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "course_weeks_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_weeks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          code: string | null;
          created_at: string;
          id: string;
          instructor: string | null;
          location: string | null;
          project_id: string;
          syllabus: string | null;
          term_end: string;
          term_start: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          id?: string;
          instructor?: string | null;
          location?: string | null;
          project_id: string;
          syllabus?: string | null;
          term_end: string;
          term_start: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          id?: string;
          instructor?: string | null;
          location?: string | null;
          project_id?: string;
          syllabus?: string | null;
          term_end?: string;
          term_start?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      focus_pauses: {
        Row: {
          id: string;
          paused_at: string;
          resumed_at: string | null;
          session_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          paused_at?: string;
          resumed_at?: string | null;
          session_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          paused_at?: string;
          resumed_at?: string | null;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "focus_pauses_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "focus_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "focus_pauses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      focus_sessions: {
        Row: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        Insert: {
          actual_minutes?: number | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          interruption_count?: number;
          planned_minutes: number;
          project_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["focus_status"];
          task_id?: string | null;
          user_id: string;
        };
        Update: {
          actual_minutes?: number | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          interruption_count?: number;
          planned_minutes?: number;
          project_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["focus_status"];
          task_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "focus_sessions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "focus_sessions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "focus_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      habit_completions: {
        Row: {
          amount: number;
          completed_at: string;
          completion_date: string;
          habit_id: string;
          id: string;
          source_block_id: string | null;
          user_id: string;
        };
        Insert: {
          amount?: number;
          completed_at?: string;
          completion_date: string;
          habit_id: string;
          id?: string;
          source_block_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          completed_at?: string;
          completion_date?: string;
          habit_id?: string;
          id?: string;
          source_block_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_completions_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "habit_completions_source_block_id_fkey";
            columns: ["source_block_id"];
            isOneToOne: false;
            referencedRelation: "calendar_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "habit_completions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      habits: {
        Row: {
          active_days: number[];
          archived_at: string | null;
          color: Database["public"]["Enums"]["project_color"] | null;
          created_at: string;
          description: string | null;
          estimated_minutes: number | null;
          frequency_type: Database["public"]["Enums"]["habit_frequency"];
          id: string;
          name: string;
          preferred_start_time: string | null;
          target: number;
          unit: Database["public"]["Enums"]["habit_unit"];
          updated_at: string;
          user_id: string;
          xp_reward: number;
        };
        Insert: {
          active_days?: number[];
          archived_at?: string | null;
          color?: Database["public"]["Enums"]["project_color"] | null;
          created_at?: string;
          description?: string | null;
          estimated_minutes?: number | null;
          frequency_type: Database["public"]["Enums"]["habit_frequency"];
          id?: string;
          name: string;
          preferred_start_time?: string | null;
          target?: number;
          unit?: Database["public"]["Enums"]["habit_unit"];
          updated_at?: string;
          user_id: string;
          xp_reward?: number;
        };
        Update: {
          active_days?: number[];
          archived_at?: string | null;
          color?: Database["public"]["Enums"]["project_color"] | null;
          created_at?: string;
          description?: string | null;
          estimated_minutes?: number | null;
          frequency_type?: Database["public"]["Enums"]["habit_frequency"];
          id?: string;
          name?: string;
          preferred_start_time?: string | null;
          target?: number;
          unit?: Database["public"]["Enums"]["habit_unit"];
          updated_at?: string;
          user_id?: string;
          xp_reward?: number;
        };
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          coins: number;
          created_at: string;
          display_name: string;
          focus_windows: Json;
          id: string;
          level: number;
          onboarding_dismissed_at: string | null;
          snap_minutes: number;
          timezone: string;
          updated_at: string;
          week_start: number;
          working_hours: Json;
          working_hours_set_at: string | null;
          xp: number;
        };
        Insert: {
          coins?: number;
          created_at?: string;
          display_name?: string;
          focus_windows?: Json;
          id: string;
          level?: number;
          onboarding_dismissed_at?: string | null;
          snap_minutes?: number;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
          working_hours?: Json;
          working_hours_set_at?: string | null;
          xp?: number;
        };
        Update: {
          coins?: number;
          created_at?: string;
          display_name?: string;
          focus_windows?: Json;
          id?: string;
          level?: number;
          onboarding_dismissed_at?: string | null;
          snap_minutes?: number;
          timezone?: string;
          updated_at?: string;
          week_start?: number;
          working_hours?: Json;
          working_hours_set_at?: string | null;
          xp?: number;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          color: Database["public"]["Enums"]["project_color"];
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          color?: Database["public"]["Enums"]["project_color"];
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          color?: Database["public"]["Enums"]["project_color"];
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quest_assignments: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          period: Database["public"]["Enums"]["quest_period"];
          period_start: string;
          quest_id: string;
          slot: number;
          timezone: string | null;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          period: Database["public"]["Enums"]["quest_period"];
          period_start: string;
          quest_id: string;
          slot: number;
          timezone?: string | null;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          period?: Database["public"]["Enums"]["quest_period"];
          period_start?: string;
          quest_id?: string;
          slot?: number;
          timezone?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_assignments_quest_id_fkey";
            columns: ["quest_id"];
            isOneToOne: false;
            referencedRelation: "quest_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quest_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quest_definitions: {
        Row: {
          active: boolean;
          coin_reward: number;
          description: string;
          id: string;
          key: string;
          metric: Database["public"]["Enums"]["quest_metric"];
          period: Database["public"]["Enums"]["quest_period"];
          target: number;
          title: string;
          xp_reward: number;
        };
        Insert: {
          active?: boolean;
          coin_reward: number;
          description: string;
          id?: string;
          key: string;
          metric: Database["public"]["Enums"]["quest_metric"];
          period: Database["public"]["Enums"]["quest_period"];
          target: number;
          title: string;
          xp_reward: number;
        };
        Update: {
          active?: boolean;
          coin_reward?: number;
          description?: string;
          id?: string;
          key?: string;
          metric?: Database["public"]["Enums"]["quest_metric"];
          period?: Database["public"]["Enums"]["quest_period"];
          target?: number;
          title?: string;
          xp_reward?: number;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          actual_minutes: number;
          archived_at: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          estimated_minutes: number | null;
          id: string;
          parent_task_id: string | null;
          priority: number;
          project_id: string | null;
          sort_order: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          actual_minutes?: number;
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          parent_task_id?: string | null;
          priority?: number;
          project_id?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          actual_minutes?: number;
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          parent_task_id?: string | null;
          priority?: number;
          project_id?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey";
            columns: ["parent_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievement_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_cosmetics: {
        Row: {
          cosmetic_id: string;
          equipped: boolean;
          purchased_at: string;
          user_id: string;
        };
        Insert: {
          cosmetic_id: string;
          equipped?: boolean;
          purchased_at?: string;
          user_id: string;
        };
        Update: {
          cosmetic_id?: string;
          equipped?: boolean;
          purchased_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_cosmetics_cosmetic_id_fkey";
            columns: ["cosmetic_id"];
            isOneToOne: false;
            referencedRelation: "cosmetic_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_cosmetics_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_goals: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          metric: Database["public"]["Enums"]["quest_metric"];
          target: number;
          title: string | null;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metric: Database["public"]["Enums"]["quest_metric"];
          target: number;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metric?: Database["public"]["Enums"]["quest_metric"];
          target?: number;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_reviews: {
        Row: {
          change_next_week: string | null;
          completed_at: string | null;
          created_at: string;
          got_in_the_way: string | null;
          id: string;
          updated_at: string;
          user_id: string;
          week_start: string;
          went_well: string | null;
        };
        Insert: {
          change_next_week?: string | null;
          completed_at?: string | null;
          created_at?: string;
          got_in_the_way?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
          week_start: string;
          went_well?: string | null;
        };
        Update: {
          change_next_week?: string | null;
          completed_at?: string | null;
          created_at?: string;
          got_in_the_way?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
          went_well?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_events: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          reason: string;
          source_id: string | null;
          source_type: Database["public"]["Enums"]["xp_source"];
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          reason: string;
          source_id?: string | null;
          source_type: Database["public"]["Enums"]["xp_source"];
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          reason?: string;
          source_id?: string | null;
          source_type?: Database["public"]["Enums"]["xp_source"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      abandon_focus_session: {
        Args: { p_id: string };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      achievement_earned: {
        Args: { p_key: string; p_user_id: string };
        Returns: boolean;
      };
      assert_caller: { Args: { p_user_id: string }; Returns: undefined };
      assign_quests: {
        Args: {
          p_period: Database["public"]["Enums"]["quest_period"];
          p_period_start: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      award_coins: {
        Args: { p_amount: number; p_user_id: string };
        Returns: number;
      };
      award_xp: {
        Args: {
          p_amount: number;
          p_reason: string;
          p_source: Database["public"]["Enums"]["xp_source"];
          p_source_id: string;
          p_user_id: string;
        };
        Returns: number;
      };
      claim_quest: {
        Args: { p_assignment_id: string };
        Returns: {
          completed_at: string | null;
          created_at: string;
          id: string;
          period: Database["public"]["Enums"]["quest_period"];
          period_start: string;
          quest_id: string;
          slot: number;
          timezone: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "quest_assignments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_weekly_goal: {
        Args: { p_goal_id: string };
        Returns: {
          completed_at: string | null;
          created_at: string;
          id: string;
          metric: Database["public"]["Enums"]["quest_metric"];
          target: number;
          title: string | null;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        SetofOptions: {
          from: "*";
          to: "weekly_goals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_block: {
        Args: { p_also_complete_task?: boolean; p_block_id: string };
        Returns: {
          all_day: boolean;
          cancelled: boolean;
          color: Database["public"]["Enums"]["project_color"] | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          end_at: string;
          habit_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date: string | null;
          recurrence: Json | null;
          recurrence_until: string | null;
          series_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "calendar_blocks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_habit_block: {
        Args: { p_block_id: string };
        Returns: {
          all_day: boolean;
          cancelled: boolean;
          color: Database["public"]["Enums"]["project_color"] | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          end_at: string;
          habit_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date: string | null;
          recurrence: Json | null;
          recurrence_until: string | null;
          series_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "calendar_blocks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_task: {
        Args: { p_task_id: string };
        Returns: {
          actual_minutes: number;
          archived_at: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          estimated_minutes: number | null;
          id: string;
          parent_task_id: string | null;
          priority: number;
          project_id: string | null;
          sort_order: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      end_focus_session: {
        Args: {
          p_id: string;
          p_status: Database["public"]["Enums"]["focus_status"];
        };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ensure_quest_assignments: {
        Args: never;
        Returns: {
          completed_at: string | null;
          created_at: string;
          id: string;
          period: Database["public"]["Enums"]["quest_period"];
          period_start: string;
          quest_id: string;
          slot: number;
          timezone: string | null;
          user_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "quest_assignments";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      evaluate_achievements: {
        Args: { p_keys?: string[]; p_user_id?: string };
        Returns: number;
      };
      finish_focus_session: {
        Args: { p_id: string };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      focus_session_elapsed_minutes: {
        Args: { p_horizon: string; p_session_id: string };
        Returns: number;
      };
      habit_completion_id: {
        Args: { p_habit_id: string; p_on_date: string };
        Returns: string;
      };
      habit_week_met: {
        Args: { p_habit_id: string; p_week_start: string };
        Returns: boolean;
      };
      is_trusted: { Args: never; Returns: boolean };
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean };
      level_for_xp: { Args: { p_xp: number }; Returns: number };
      local_week_start: {
        Args: { p_date: string; p_week_start: number };
        Returns: string;
      };
      mark_interruption: {
        Args: { p_id: string };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      metric_progress: {
        Args: {
          p_from: string;
          p_metric: Database["public"]["Enums"]["quest_metric"];
          p_to: string;
          p_user_id: string;
        };
        Returns: number;
      };
      pause_focus_session: {
        Args: { p_id: string };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purchase_cosmetic: {
        Args: { p_cosmetic_id: string };
        Returns: {
          cosmetic_id: string;
          equipped: boolean;
          purchased_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "user_cosmetics";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      quest_assignment_id: {
        Args: { p_period_start: string; p_quest_id: string; p_user_id: string };
        Returns: string;
      };
      quest_progress: { Args: { p_assignment_id: string }; Returns: number };
      quest_rotation_offset: { Args: { p_user_id: string }; Returns: number };
      reconcile_xp: {
        Args: { p_user_id: string };
        Returns: {
          coins: number;
          created_at: string;
          display_name: string;
          focus_windows: Json;
          id: string;
          level: number;
          onboarding_dismissed_at: string | null;
          snap_minutes: number;
          timezone: string;
          updated_at: string;
          week_start: number;
          working_hours: Json;
          working_hours_set_at: string | null;
          xp: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_habit_completion: {
        Args: {
          p_amount?: number;
          p_habit_id: string;
          p_on_date: string;
          p_source_block_id?: string;
        };
        Returns: {
          amount: number;
          completed_at: string;
          completion_date: string;
          habit_id: string;
          id: string;
          source_block_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "habit_completions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reject_guarded_write: {
        Args: { p_column: string; p_table: string };
        Returns: undefined;
      };
      remove_habit_completion: {
        Args: { p_habit_id: string; p_on_date: string };
        Returns: {
          amount: number;
          completed_at: string;
          completion_date: string;
          habit_id: string;
          id: string;
          source_block_id: string | null;
          user_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "habit_completions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      resume_focus_session: {
        Args: { p_id: string };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_focus_session: {
        Args: {
          p_id?: string;
          p_planned_minutes: number;
          p_project_id?: string;
          p_task_id?: string;
        };
        Returns: {
          actual_minutes: number | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          interruption_count: number;
          planned_minutes: number;
          project_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["focus_status"];
          task_id: string | null;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "focus_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      uncomplete_block: {
        Args: { p_also_uncomplete_task?: boolean; p_block_id: string };
        Returns: {
          all_day: boolean;
          cancelled: boolean;
          color: Database["public"]["Enums"]["project_color"] | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          end_at: string;
          habit_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date: string | null;
          recurrence: Json | null;
          recurrence_until: string | null;
          series_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "calendar_blocks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      uncomplete_habit_block: {
        Args: { p_block_id: string };
        Returns: {
          all_day: boolean;
          cancelled: boolean;
          color: Database["public"]["Enums"]["project_color"] | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          end_at: string;
          habit_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          occurrence_date: string | null;
          recurrence: Json | null;
          recurrence_until: string | null;
          series_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "calendar_blocks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      uncomplete_task: {
        Args: { p_task_id: string };
        Returns: {
          actual_minutes: number;
          archived_at: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          estimated_minutes: number | null;
          id: string;
          parent_task_id: string | null;
          priority: number;
          project_id: string | null;
          sort_order: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      weekly_goal_award_id: {
        Args: {
          p_metric: Database["public"]["Enums"]["quest_metric"];
          p_user_id: string;
          p_week_start: string;
        };
        Returns: string;
      };
      weekly_goal_progress: { Args: { p_goal_id: string }; Returns: number };
      xp_daily_cap: {
        Args: { p_source: Database["public"]["Enums"]["xp_source"] };
        Returns: number;
      };
      xp_for_level: { Args: { p_level: number }; Returns: number };
      xp_rule: { Args: { p_name: string }; Returns: number };
      xp_rule_unknown: { Args: { p_name: string }; Returns: number };
    };
    Enums: {
      block_kind: "event" | "work" | "habit";
      cosmetic_kind: "profile_frame" | "theme" | "block_style" | "avatar";
      focus_status: "running" | "paused" | "completed" | "abandoned";
      habit_frequency:
        "daily" | "weekdays" | "times_per_week" | "amount_per_day" | "amount_per_week";
      habit_unit: "count" | "minutes";
      project_color:
        | "slate"
        | "red"
        | "orange"
        | "amber"
        | "green"
        | "teal"
        | "cyan"
        | "blue"
        | "indigo"
        | "violet"
        | "pink"
        | "rose";
      quest_metric:
        | "tasks_completed"
        | "priority_tasks_completed"
        | "focus_minutes"
        | "habits_completed"
        | "habit_days"
        | "blocks_completed";
      quest_period: "daily" | "weekly";
      task_status: "open" | "completed" | "archived";
      xp_source:
        "task" | "focus_session" | "habit_completion" | "quest" | "weekly_goal" | "achievement";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_kind: ["event", "work", "habit"],
      cosmetic_kind: ["profile_frame", "theme", "block_style", "avatar"],
      focus_status: ["running", "paused", "completed", "abandoned"],
      habit_frequency: ["daily", "weekdays", "times_per_week", "amount_per_day", "amount_per_week"],
      habit_unit: ["count", "minutes"],
      project_color: [
        "slate",
        "red",
        "orange",
        "amber",
        "green",
        "teal",
        "cyan",
        "blue",
        "indigo",
        "violet",
        "pink",
        "rose",
      ],
      quest_metric: [
        "tasks_completed",
        "priority_tasks_completed",
        "focus_minutes",
        "habits_completed",
        "habit_days",
        "blocks_completed",
      ],
      quest_period: ["daily", "weekly"],
      task_status: ["open", "completed", "archived"],
      xp_source: [
        "task",
        "focus_session",
        "habit_completion",
        "quest",
        "weekly_goal",
        "achievement",
      ],
    },
  },
} as const;
